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
    col = client.post(f"/api/libraries/{lib['id']}/folders",
                      json={"name": "数字图像处理", "kind": "course"}).json()
    doc = client.post(f"/api/folders/{col['id']}/documents",
                      json={"name": "第1章 图像基础", "docType": "study"}).json()
    sec = client.post(f"/api/documents/{doc['id']}/sections",
                      json={"name": "像素与采样"}).json()
    return {"lib": lib, "col": col, "doc": doc, "sec": sec}


def test_health():
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["ok"] is True
    assert r.json()["version"] == "1.1.4"


def test_vault_get_path():
    r = client.get("/api/settings/vault")
    assert r.status_code == 200
    data = r.json()
    assert data["path"]
    assert isinstance(data["configured"], bool)


def test_vault_migrate_copies_then_deletes(tmp_path, monkeypatch):
    """迁移：整体复制到新目录 → 校验一致 → 删除源文件 → 更新 .env（先复制后删除）。"""
    import app.api.settings as settings_mod

    src = tmp_path / "src-vault"
    src.mkdir()
    (src / "index.json").write_text('{"libraries": []}', encoding="utf-8")
    (src / "libraries").mkdir()
    (src / "libraries" / "x.mpf").write_text('{"format":"meta-pilot"}', encoding="utf-8")
    monkeypatch.setattr(settings_mod, "DATA_DIR", src)
    monkeypatch.setattr(settings_mod, "ENV_FILE", tmp_path / ".env")  # .env 写入 tmp，不碰真实 .env

    target = tmp_path / "dst-vault"
    target.mkdir()
    r = client.post("/api/settings/vault/migrate", json={"path": str(target)})
    assert r.status_code == 200, r.text
    assert r.json()["migrated"] is True and r.json()["restartRequired"] is True
    # 新目录数据一致
    assert (target / "index.json").read_text(encoding="utf-8") == '{"libraries": []}'
    assert (target / "libraries" / "x.mpf").exists()
    # 源文件已删除
    assert not src.exists() or not any(src.iterdir())
    # .env 已更新
    env = (tmp_path / ".env").read_text(encoding="utf-8")
    assert f"DATA_DIR={target}" in env


def test_vault_migrate_rejects_unsafe(tmp_path):
    """目标为空目录校验：不存在 / 非空 均拒绝。"""
    r = client.post("/api/settings/vault/migrate", json={"path": str(tmp_path / "nope")})
    assert r.status_code == 400
    nonempty = tmp_path / "nonempty"
    nonempty.mkdir()
    (nonempty / "a.txt").write_text("x", encoding="utf-8")
    r2 = client.post("/api/settings/vault/migrate", json={"path": str(nonempty)})
    assert r2.status_code == 400


def test_library_crud():
    # create
    lib = client.post("/api/libraries", json={"name": "我的库", "description": "d"}).json()
    assert lib["name"] == "我的库"
    assert lib["folders"] == []
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


def test_library_pin_and_default():
    """置顶可多个；默认库唯一（设新默认后旧默认清除）；列表置顶优先。"""
    a = client.post("/api/libraries", json={"name": "库A"}).json()
    b = client.post("/api/libraries", json={"name": "库B"}).json()
    try:
        # 默认标记初始为 False
        assert client.get(f"/api/libraries/{a['id']}").json()["isDefault"] is False
        # 设为默认（唯一性）
        client.post(f"/api/libraries/{a['id']}/default")
        assert client.get(f"/api/libraries/{a['id']}").json()["isDefault"] is True
        client.post(f"/api/libraries/{b['id']}/default")
        assert client.get(f"/api/libraries/{a['id']}").json()["isDefault"] is False
        assert client.get(f"/api/libraries/{b['id']}").json()["isDefault"] is True
        # 置顶（可多个）
        client.put(f"/api/libraries/{a['id']}", json={"name": "库A", "pinned": True})
        client.put(f"/api/libraries/{b['id']}", json={"name": "库B", "pinned": True})
        listed = client.get("/api/libraries").json()
        assert listed[0]["pinned"] is True and listed[1]["pinned"] is True
        # 取消置顶后回到普通位置
        client.put(f"/api/libraries/{a['id']}", json={"name": "库A", "pinned": False})
        listed = client.get("/api/libraries").json()
        assert any(it["id"] == a["id"] and it["pinned"] is False for it in listed)
        # 摘要字段带 pinned/isDefault
        entry = next(it for it in listed if it["id"] == b["id"])
        assert entry["pinned"] is True and entry["isDefault"] is True
    finally:
        client.delete(f"/api/libraries/{a['id']}")
        client.delete(f"/api/libraries/{b['id']}")


def test_tree_crud():
    t = _make_tree()
    # 文档集信息
    col = client.get(f"/api/libraries/{t['lib']['id']}").json()["folders"][0]
    assert col["kind"] == "course"
    assert col["documents"][0]["name"] == "第1章 图像基础"
    # 更新文档
    client.put(f"/api/documents/{t['doc']['id']}", json={"name": "第1章 绪论", "docType": "quiz"})
    got = client.get(f"/api/libraries/{t['lib']['id']}").json()
    assert got["folders"][0]["documents"][0]["name"] == "第1章 绪论"
    assert got["folders"][0]["documents"][0]["docType"] == "quiz"
    # 更新小节名
    client.put(f"/api/sections/{t['sec']['id']}", json={"name": "采样定理"})
    got = client.get(f"/api/libraries/{t['lib']['id']}").json()
    assert got["folders"][0]["documents"][0]["sections"][0]["name"] == "采样定理"


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
    blocks = got["folders"][0]["documents"][0]["sections"][0]["blocks"]
    assert [b["type"] for b in blocks] == [c["type"] for c in cases]
    # 更新与删除
    bid = blocks[1]["id"]
    client.put(f"/api/blocks/{bid}", json={"type": "single_choice", "question": "Q2",
                                            "options": ["A", "B"], "answer": 0})
    got = client.get(f"/api/libraries/{t['lib']['id']}").json()
    blocks = got["folders"][0]["documents"][0]["sections"][0]["blocks"]
    assert blocks[1]["question"] == "Q2"
    assert blocks[1]["answer"] == 0
    client.delete(f"/api/blocks/{bid}")
    got = client.get(f"/api/libraries/{t['lib']['id']}").json()
    blocks = got["folders"][0]["documents"][0]["sections"][0]["blocks"]
    assert len(blocks) == len(cases) - 1


def test_delete_collection_cleanup():
    t = _make_tree()
    cid = t["col"]["id"]
    client.put(f"/api/plugins/course/progress/{cid}/toggle/{t['sec']['id']}")
    client.post("/api/plugins/course/stats/sessions", json={"collectionId": cid, "durationSec": 30})
    client.delete(f"/api/folders/{cid}")
    assert client.get(f"/api/libraries/{t['lib']['id']}").json()["folders"] == []


def test_progress_flow():
    t = _make_tree()
    cid, sid = t["col"]["id"], t["sec"]["id"]
    r = client.get(f"/api/plugins/course/progress/{cid}").json()
    assert r["completedSections"] == []
    # toggle on
    r = client.put(f"/api/plugins/course/progress/{cid}/toggle/{sid}").json()
    assert r["completed"] is True
    r = client.get(f"/api/plugins/course/progress/{cid}").json()
    assert sid in r["completedSections"]
    # toggle off
    r = client.put(f"/api/plugins/course/progress/{cid}/toggle/{sid}").json()
    assert r["completed"] is False
    # position
    client.put(f"/api/plugins/course/progress/{cid}/position",
               json={"documentId": t["doc"]["id"], "sectionId": sid})
    r = client.get(f"/api/plugins/course/progress/{cid}").json()
    assert r["lastPosition"]["sectionId"] == sid
    # set_completed 显式
    client.put(f"/api/plugins/course/progress/{cid}/completed/{sid}?completed=true")
    assert sid in client.get(f"/api/plugins/course/progress/{cid}").json()["completedSections"]


def test_stats_flow():
    t = _make_tree()
    cid = t["col"]["id"]
    client.post("/api/plugins/course/stats/sessions", json={"collectionId": cid, "durationSec": 60})
    client.post("/api/plugins/course/stats/sessions", json={"collectionId": cid, "durationSec": 40})
    s = client.get("/api/plugins/course/stats/summary?range=all").json()
    assert s["totalSeconds"] == 100
    assert s["sessionCount"] == 2
    per = {p["collectionId"]: p["seconds"] for p in s["perCollection"]}
    assert per[cid] == 100
