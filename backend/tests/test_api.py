"""后端 API 测试：库/文档集/文档/小节/块 CRUD、进度、统计。

每个测试使用独立的临时数据目录，不污染真实数据。
"""
import tempfile
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app
from app.plugins.base import manager
from app.storage.progress import ProgressStore
from app.storage.stats import StatsStore
from app.storage.store import LibraryStore

client = TestClient(app)


def _reset():
    tmp = Path(tempfile.mkdtemp(prefix="metapilot_test_"))
    manager.configure(tmp)
    app.state.store = LibraryStore(tmp)
    app.state.progress = ProgressStore(tmp)
    app.state.stats = StatsStore(tmp)


def setup_function():
    _reset()


def _make_tree():
    """创建 库->课程->章节->小节，返回 id 字典。"""
    lib = client.post("/api/libraries", json={"name": "测试库"}).json()
    col = client.post(f"/api/libraries/{lib['id']}/collections",
                      json={"name": "数字图像处理", "kind": "course"}).json()
    doc = client.post(f"/api/collections/{col['id']}/documents",
                      json={"name": "第1章 图像基础", "docType": "study"}).json()
    sec = client.post(f"/api/documents/{doc['id']}/sections",
                      json={"name": "像素与采样"}).json()
    return {"lib": lib, "col": col, "doc": doc, "sec": sec}


def test_health():
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["ok"] is True
    assert r.json()["version"] == "1.0.0"


def test_library_crud():
    # create
    lib = client.post("/api/libraries", json={"name": "我的库", "description": "d"}).json()
    assert lib["name"] == "我的库"
    assert lib["collections"] == []
    # list
    listed = client.get("/api/libraries").json()
    assert any(it["id"] == lib["id"] for it in listed)
    # get
    got = client.get(f"/api/libraries/{lib['id']}").json()
    assert got["name"] == "我的库"
    # update
    up = client.put(f"/api/libraries/{lib['id']}", json={"name": "改名", "description": ""}).json()
    assert up["name"] == "改名"
    # delete
    client.delete(f"/api/libraries/{lib['id']}")
    assert client.get(f"/api/libraries/{lib['id']}").status_code == 404
    # 404 检查
    assert client.get("/api/libraries/nope").status_code == 404


def test_tree_crud():
    t = _make_tree()
    # 文档集信息
    col = client.get(f"/api/libraries/{t['lib']['id']}").json()["collections"][0]
    assert col["kind"] == "course"
    assert col["documents"][0]["name"] == "第1章 图像基础"
    # 更新文档
    client.put(f"/api/documents/{t['doc']['id']}", json={"name": "第1章 绪论", "docType": "quiz"})
    got = client.get(f"/api/libraries/{t['lib']['id']}").json()
    assert got["collections"][0]["documents"][0]["name"] == "第1章 绪论"
    assert got["collections"][0]["documents"][0]["docType"] == "quiz"
    # 更新小节名
    client.put(f"/api/sections/{t['sec']['id']}", json={"name": "采样定理"})
    got = client.get(f"/api/libraries/{t['lib']['id']}").json()
    assert got["collections"][0]["documents"][0]["sections"][0]["name"] == "采样定理"


def test_blocks_all_types():
    t = _make_tree()
    sid = t["sec"]["id"]
    cases = [
        {"type": "markdown", "content": "# 标题"},
        {"type": "single_choice", "question": "Q", "options": ["A", "B"], "answer": 1, "explanation": "e"},
        {"type": "multiple_choice", "question": "M", "options": ["A", "B", "C"], "answers": [0, 2]},
        {"type": "fill_blank", "question": "F", "blanks": ["答案"], "ai_graded": True},
        {"type": "short_answer", "question": "S", "reference": "参考答案", "keywords": ["k1"]},
        {"type": "interactive", "title": "演示", "file": "interactives/x.html", "height": 500},
    ]
    for c in cases:
        r = client.post(f"/api/sections/{sid}/blocks", json=c)
        assert r.status_code == 200, f"block {c['type']} 创建失败: {r.text}"
    got = client.get(f"/api/libraries/{t['lib']['id']}").json()
    blocks = got["collections"][0]["documents"][0]["sections"][0]["blocks"]
    assert [b["type"] for b in blocks] == [c["type"] for c in cases]
    # 更新与删除
    bid = blocks[1]["id"]
    client.put(f"/api/blocks/{bid}", json={"type": "single_choice", "question": "Q2",
                                            "options": ["A", "B"], "answer": 0})
    got = client.get(f"/api/libraries/{t['lib']['id']}").json()
    blocks = got["collections"][0]["documents"][0]["sections"][0]["blocks"]
    assert blocks[1]["question"] == "Q2"
    assert blocks[1]["answer"] == 0
    client.delete(f"/api/blocks/{bid}")
    got = client.get(f"/api/libraries/{t['lib']['id']}").json()
    blocks = got["collections"][0]["documents"][0]["sections"][0]["blocks"]
    assert len(blocks) == len(cases) - 1


def test_delete_collection_cleanup():
    t = _make_tree()
    cid = t["col"]["id"]
    client.put(f"/api/progress/{cid}/toggle/{t['sec']['id']}")
    client.post("/api/stats/sessions", json={"collectionId": cid, "durationSec": 30})
    client.delete(f"/api/collections/{cid}")
    assert client.get(f"/api/libraries/{t['lib']['id']}").json()["collections"] == []


def test_progress_flow():
    t = _make_tree()
    cid, sid = t["col"]["id"], t["sec"]["id"]
    r = client.get(f"/api/progress/{cid}").json()
    assert r["completedSections"] == []
    # toggle on
    r = client.put(f"/api/progress/{cid}/toggle/{sid}").json()
    assert r["completed"] is True
    r = client.get(f"/api/progress/{cid}").json()
    assert sid in r["completedSections"]
    # toggle off
    r = client.put(f"/api/progress/{cid}/toggle/{sid}").json()
    assert r["completed"] is False
    # position
    client.put(f"/api/progress/{cid}/position",
               json={"documentId": t["doc"]["id"], "sectionId": sid})
    r = client.get(f"/api/progress/{cid}").json()
    assert r["lastPosition"]["sectionId"] == sid
    # set_completed 显式
    client.put(f"/api/progress/{cid}/completed/{sid}?completed=true")
    assert sid in client.get(f"/api/progress/{cid}").json()["completedSections"]


def test_stats_flow():
    t = _make_tree()
    cid = t["col"]["id"]
    client.post("/api/stats/sessions", json={"collectionId": cid, "durationSec": 60})
    client.post("/api/stats/sessions", json={"collectionId": cid, "durationSec": 40})
    s = client.get("/api/stats/summary?range=all").json()
    assert s["totalSeconds"] == 100
    assert s["sessionCount"] == 2
    per = {p["collectionId"]: p["seconds"] for p in s["perCollection"]}
    assert per[cid] == 100
