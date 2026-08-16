""".mpf 导入/导出测试：doc（课程/库）、canvas（图表）、.canvas 自动转换。"""
import io
import tempfile
import zipfile
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app
from app.plugins.base import manager
from app.services.importer import CourseImporter
from app.storage.progress import ProgressStore
from app.storage.stats import StatsStore
from app.storage.store import LibraryStore

client = TestClient(app)


def _reset():
    tmp = Path(tempfile.mkdtemp(prefix="metapilot_mpfio_"))
    manager.configure(tmp)
    assets = tmp / "assets" / "courses"
    app.state.store = LibraryStore(tmp)
    app.state.progress = ProgressStore(tmp)
    app.state.stats = StatsStore(tmp)
    app.state.importer = CourseImporter(app.state.store, assets)


def setup_function():
    _reset()


def _make_course():
    lib = client.post("/api/libraries", json={"name": "专业课"}).json()
    col = client.post(f"/api/libraries/{lib['id']}/folders",
                      json={"name": "课程A", "kind": "course"}).json()
    doc = client.post(f"/api/folders/{col['id']}/documents",
                      json={"name": "第1章", "docType": "study"}).json()
    sec = client.post(f"/api/documents/{doc['id']}/sections", json={"name": "小节"}).json()
    client.post(f"/api/sections/{sec['id']}/blocks",
                json={"type": "markdown", "content": "# 内容"})
    return {"lib": lib, "col": col, "doc": doc, "sec": sec}


def test_export_import_doc_course():
    t = _make_course()
    # 导出课程为 .mpf
    r = client.get(f"/api/mpf/folders/{t['col']['id']}/export-mpf")
    assert r.status_code == 200
    text = r.text
    assert '"type": "doc"' in text
    assert '"name": "课程A"' in text
    # 导入到新库
    r2 = client.post("/api/mpf/import", files={"file": ("course.mpf", text.encode("utf-8"), "application/json")})
    assert r2.status_code == 200, r2.text
    result = r2.json()
    assert result["type"] == "doc"
    assert result["imported"][0]["name"] == "课程A"
    # 内容一致
    lib = client.get(f"/api/libraries/{result['libraryId']}").json()
    col = lib["folders"][0]
    assert col["documents"][0]["sections"][0]["blocks"][0]["content"] == "# 内容"


def test_export_library_mpf():
    t = _make_course()
    r = client.get(f"/api/mpf/libraries/{t['lib']['id']}/export-mpf")
    assert r.status_code == 200
    assert '"type": "doc"' in r.text
    assert '"folders"' in r.text
    assert '"name": "专业课"' in r.text


def test_import_canvas_mpf():
    mpf_text = '{"format":"meta-pilot","formatVersion":1,"type":"canvas","name":"思维图","canvas":{"nodes":[{"id":"n1","type":"text","x":0,"y":0,"width":100,"height":50,"text":"A"}],"edges":[]}}'
    r = client.post("/api/mpf/import", files={"file": ("chart.mpf", mpf_text.encode("utf-8"), "application/json")})
    assert r.status_code == 200, r.text
    result = r.json()
    assert result["type"] == "canvas"
    # canvas 集合存在，数据保存
    col = client.get(f"/api/folders/{result['collectionId']}").json()
    assert col["kind"] == "canvas"
    assert col["canvas"]["nodes"][0]["id"] == "n1"
    assert col["name"] == "思维图"
    # 导出 canvas 集合仍为 canvas 类型
    r2 = client.get(f"/api/mpf/folders/{result['collectionId']}/export-mpf")
    assert '"type": "canvas"' in r2.text


def test_import_raw_canvas_file():
    """.canvas（JSON Canvas，无 format 头）导入自动转换。"""
    canvas = {
        "nodes": [
            {"id": "n1", "type": "text", "x": 10, "y": 20, "width": 200, "height": 80, "text": "# 主题"},
            {"id": "n2", "type": "file", "x": 300, "y": 20, "width": 200, "height": 80, "file": "docs/a.md"},
        ],
        "edges": [{"id": "e1", "fromNode": "n1", "toNode": "n2", "label": "引用"}],
    }
    import json
    r = client.post("/api/mpf/import",
                    files={"file": ("obsidian.canvas", json.dumps(canvas).encode("utf-8"), "application/json")})
    assert r.status_code == 200, r.text
    result = r.json()
    assert result["type"] == "canvas"
    col = client.get(f"/api/folders/{result['collectionId']}").json()
    assert len(col["canvas"]["nodes"]) == 2
    assert len(col["canvas"]["edges"]) == 1


def test_import_invalid_mpf():
    r = client.post("/api/mpf/import", files={"file": ("bad.mpf", b"not json", "application/json")})
    assert r.status_code == 400


def test_mpf_unresolved_reported():
    """含课程块（single_choice）的 doc .mpf 导入返回 unresolved 标记。"""
    mpf_text = ('{"format":"meta-pilot","formatVersion":1,"type":"doc","name":"课",'
                '"folders":[{"name":"课","kind":"course","documents":[{"name":"章",'
                '"sections":[{"name":"节","blocks":[{"type":"single_choice","question":"q","options":["a"],"answer":0}]}]}]}]}')
    r = client.post("/api/mpf/import", files={"file": ("c.mpf", mpf_text.encode("utf-8"), "application/json")})
    assert r.status_code == 200, r.text
    result = r.json()
    assert result["type"] == "doc"
    assert any(u["requiredPlugin"] == "course" for u in result["unresolved"])
