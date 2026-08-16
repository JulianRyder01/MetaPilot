"""课程包导入/导出测试。"""
import io
import json
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
    tmp = Path(tempfile.mkdtemp(prefix="metapilot_imp_"))
    manager.configure(tmp)
    assets = tmp / "assets" / "courses"
    app.state.store = LibraryStore(tmp)
    app.state.progress = ProgressStore(tmp)
    app.state.stats = StatsStore(tmp)
    app.state.importer = CourseImporter(app.state.store, assets)


def setup_function():
    _reset()


def make_zip(manifest: dict, assets: dict | None = None) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False))
        for name, content in (assets or {}).items():
            zf.writestr(name, content)
    return buf.getvalue()


def sample_manifest() -> dict:
    return {
        "formatVersion": 1,
        "id": "demo-course",
        "name": "示例课程",
        "author": "MetaPilot",
        "version": "1.0.0",
        "description": "导入测试课程",
        "library": {"name": "专业库", "description": "导入自动建库"},
        "collections": [
            {
                "name": "示例课程",
                "kind": "course",
                "description": "",
                "documents": [
                    {
                        "name": "第1章",
                        "docType": "study",
                        "sections": [
                            {
                                "name": "知识点1",
                                "blocks": [
                                    {"type": "markdown", "content": "# 你好"},
                                    {"type": "single_choice", "question": "Q",
                                     "options": ["A", "B"], "answer": 0},
                                    {"type": "interactive", "title": "演示",
                                     "file": "interactives/demo.html", "height": 400},
                                ],
                            }
                        ],
                    }
                ],
            }
        ],
    }


def test_import_course_zip():
    z = make_zip(sample_manifest(), {"interactives/demo.html": b"<h1>demo</h1>"})
    r = client.post(
        "/api/plugins/course/import",
        files={"file": ("course.zip", z, "application/zip")},
    )
    assert r.status_code == 200, r.text
    result = r.json()
    assert result["packageId"] == "demo-course"
    cid = result["imported"][0]["collectionId"]

    # 库树
    lib = client.get(f"/api/libraries/{result['libraryId']}").json()
    col = lib["folders"][0]
    assert col["name"] == "示例课程"
    assert col["packageId"] == "demo-course"
    blocks = col["documents"][0]["sections"][0]["blocks"]
    assert [b["type"] for b in blocks] == ["markdown", "single_choice", "interactive"]

    # 资产落盘检查（静态挂载指向真实 data 目录，测试直接检查 importer 目录）
    asset_path = app.state.importer.assets_dir / cid / "interactives" / "demo.html"
    assert asset_path.exists()
    assert asset_path.read_bytes() == b"<h1>demo</h1>"


def test_import_replaces_same_package():
    z = make_zip(sample_manifest(), {"interactives/demo.html": b"v1"})
    r1 = client.post("/api/plugins/course/import", files={"file": ("c.zip", z, "application/zip")})
    lib_id = r1.json()["libraryId"]
    old_cid = r1.json()["imported"][0]["collectionId"]

    # 同一 packageId 再次导入（v2 内容）
    m2 = sample_manifest()
    m2["collections"][0]["documents"][0]["sections"][0]["blocks"] = [
        {"type": "markdown", "content": "# v2"}
    ]
    r2 = client.post(
        "/api/plugins/course/import",
        data={"libraryId": lib_id},
        files={"file": ("c.zip", make_zip(m2, {"interactives/demo.html": b"v2"}), "application/zip")},
    )
    new_cid = r2.json()["imported"][0]["collectionId"]
    assert new_cid != old_cid

    lib = client.get(f"/api/libraries/{lib_id}").json()
    assert len(lib["folders"]) == 1  # 旧课程被替换
    assert lib["folders"][0]["id"] == new_cid


def test_import_invalid_zip():
    r = client.post("/api/plugins/course/import",
                    files={"file": ("bad.zip", b"not a zip", "application/zip")})
    assert r.status_code == 400


def test_markdown_import():
    md = """# 我的第一份笔记
这是开头正文。

## 知识点一
这里是知识点一的**内容**。

## 知识点二
- 列表项1
- 列表项2

### 子标题也算小节
子内容。
"""
    r = client.post(
        "/api/plugins/notes/import",
        files={"file": ("note.md", md.encode("utf-8"), "text/markdown")},
    )
    assert r.status_code == 200, r.text
    result = r.json()
    assert result["sectionCount"] == 4

    lib = client.get(f"/api/libraries/{result['libraryId']}").json()
    assert lib["name"] == "笔记库"
    col = lib["folders"][0]
    assert col["kind"] == "note"
    doc = col["documents"][0]
    assert doc["name"] == "我的第一份笔记"
    assert doc["docType"] == "note"
    names = [s["name"] for s in doc["sections"]]
    assert names == ["概述", "知识点一", "知识点二", "子标题也算小节"]
    # 概述小节保留开头正文
    first_block = doc["sections"][0]["blocks"][0]
    assert first_block["type"] == "markdown"
    assert "这是开头正文" in first_block["content"]
    # 知识点一小节块内容
    sec_block = doc["sections"][1]["blocks"][0]
    assert "知识点一的" in sec_block["content"]


def test_export_course_zip():
    z = make_zip(sample_manifest(), {"interactives/demo.html": b"<h1>demo</h1>"})
    r = client.post("/api/plugins/course/import", files={"file": ("c.zip", z, "application/zip")})
    cid = r.json()["imported"][0]["collectionId"]

    r2 = client.get(f"/api/plugins/course/{cid}/export")
    assert r2.status_code == 200
    assert r2.headers["content-type"] == "application/zip"
    with zipfile.ZipFile(io.BytesIO(r2.content)) as zf:
        names = zf.namelist()
        assert "manifest.json" in names
        assert "interactives/demo.html" in names
        manifest = json.loads(zf.read("manifest.json"))
        assert manifest["id"] == "demo-course"
        assert manifest["folders"][0]["documents"][0]["sections"][0]["blocks"][0]["type"] == "markdown"
