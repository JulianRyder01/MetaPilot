"""官方核心统计测试：访问记录、汇总（Top/热力图/停留/字数）、组件清单。"""
import tempfile
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app
from app.plugins.base import manager
from app.services.stats_core import init_stats_core
from app.storage.progress import ProgressStore
from app.storage.stats import StatsStore
from app.storage.store import LibraryStore

client = TestClient(app)


def _reset():
    tmp = Path(tempfile.mkdtemp(prefix="metapilot_sc_"))
    manager.configure(tmp)
    app.state.store = LibraryStore(tmp)
    app.state.progress = ProgressStore(tmp)
    app.state.stats = StatsStore(tmp)
    init_stats_core(tmp, app.state.store)


def setup_function():
    _reset()


def _make_doc(cid: str, name: str):
    return client.post(f"/api/collections/{cid}/documents",
                       json={"name": name, "docType": "note"}).json()


def test_record_visit_and_summary():
    lib = client.post("/api/libraries", json={"name": "库"}).json()
    col = client.post(f"/api/libraries/{lib['id']}/collections",
                      json={"name": "文档集", "kind": "note"}).json()
    d1 = _make_doc(col["id"], "文档A")
    d2 = _make_doc(col["id"], "文档B")

    # 访问记录：A 3 次、B 1 次
    for i in range(3):
        client.post("/api/stats/core/visit", json={
            "collectionId": col["id"], "documentId": d1["id"], "documentName": "文档A", "durationSec": 30 + i,
        })
    client.post("/api/stats/core/visit", json={
        "collectionId": col["id"], "documentId": d2["id"], "documentName": "文档B", "durationSec": 10,
    })

    s = client.get("/api/stats/core/summary").json()
    assert s["totalVisits"] == 4
    assert s["totalDurationSec"] == 30 + 31 + 32 + 10
    # 最常访问 Top1 = 文档A
    assert s["topDocs"][0]["docId"] == d1["id"]
    assert s["topDocs"][0]["visits"] == 3
    # 最近访问第一条 = 文档B（最后一次）
    assert s["recentDocs"][0]["docId"] == d2["id"]
    # 热力图维度
    assert len(s["heatmap"]["byWeekday"]) == 7
    assert len(s["heatmap"]["byHour"]) == 24
    assert sum(s["heatmap"]["byHour"]) == 4


def test_word_count():
    lib = client.post("/api/libraries", json={"name": "库"}).json()
    col = client.post(f"/api/libraries/{lib['id']}/collections",
                      json={"name": "文档集", "kind": "note"}).json()
    doc = _make_doc(col["id"], "文档")
    sec = client.post(f"/api/documents/{doc['id']}/sections", json={"name": "节"}).json()
    client.post(f"/api/sections/{sec['id']}/blocks",
                json={"type": "markdown", "content": "一二三四五 六七八九十"})

    s = client.get("/api/stats/core/summary").json()
    assert s["totalWords"] == 10  # 中文字符数
    assert s["wordsPerCollection"][0]["words"] == 10


def test_widgets_list_contains_core_and_course():
    widgets = client.get("/api/stats/widgets").json()
    ids = [w["id"] for w in widgets]
    # core 基础组件
    for w in ("topDocs", "heatmap", "stayTime", "wordCount", "recentDocs"):
        assert w in ids, f"缺少 core 组件 {w}"
    # course 插件贡献的学习组件
    for w in ("studyDuration", "dailyStudy", "perCourse"):
        assert w in ids, f"缺少 course 组件 {w}"
    by_id = {w["id"]: w for w in widgets}
    assert by_id["topDocs"]["source"] == "core"
    assert by_id["studyDuration"]["source"] == "course"


def test_visit_independent_of_course_plugin():
    """core 访问统计不依赖课程插件（禁用 course 后仍可上报）。"""
    lib = client.post("/api/libraries", json={"name": "库"}).json()
    col = client.post(f"/api/libraries/{lib['id']}/collections",
                      json={"name": "集", "kind": "note"}).json()
    doc = _make_doc(col["id"], "文档")
    client.post("/api/plugins/course/disable")
    r = client.post("/api/stats/core/visit", json={
        "collectionId": col["id"], "documentId": doc["id"], "documentName": "文档", "durationSec": 5,
    })
    assert r.status_code == 200
    assert client.get("/api/stats/core/summary").json()["totalVisits"] == 1
    client.post("/api/plugins/course/enable")
