"""插件管理测试：清单、启用/禁用、禁用后依赖接口返回 503 + 提示。"""
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
    tmp = Path(tempfile.mkdtemp(prefix="metapilot_plugins_"))
    manager.configure(tmp)
    assets = tmp / "assets" / "courses"
    app.state.store = LibraryStore(tmp)
    app.state.progress = ProgressStore(tmp)
    app.state.stats = StatsStore(tmp)
    app.state.importer = CourseImporter(app.state.store, assets)


def setup_function():
    _reset()


def make_zip() -> bytes:
    manifest = {
        "formatVersion": 1,
        "id": "demo",
        "name": "示例",
        "collections": [{
            "name": "示例课程", "kind": "course", "documents": [
                {"name": "章", "docType": "study", "sections": [
                    {"name": "节", "blocks": [{"type": "markdown", "content": "# hi"}]}
                ]}
            ]
        }],
    }
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False))
    return buf.getvalue()


def test_plugin_list_contains_loaded_plugins():
    r = client.get("/api/plugins")
    assert r.status_code == 200
    plugins = r.json()
    ids = [p["id"] for p in plugins]
    assert "course" in ids
    assert "knowledge_base" in ids
    for p in plugins:
        assert "enabled" in p
        assert "description" in p
        assert "dependsOn" in p


def test_disable_course_blocks_import_and_notes():
    # 默认启用时可导入
    r = client.post("/api/plugins/course/import",
                    files={"file": ("c.zip", make_zip(), "application/zip")})
    assert r.status_code == 200

    # 禁用课程插件
    r = client.post("/api/plugins/course/disable").json()
    assert r["enabled"] is False

    # 课程导入 / 导出 / 学习进度 / 统计 / AI 判题 / 交互资产 返回 503 + 提示
    resp = client.post("/api/plugins/course/import",
                       files={"file": ("c.zip", make_zip(), "application/zip")})
    assert resp.status_code == 503
    assert "课程" in resp.json()["detail"]
    assert "启用" in resp.json()["detail"]

    assert client.get("/api/progress/demo").status_code == 503
    assert client.get("/api/stats/summary").status_code == 503
    assert client.post("/api/ai/grade", json={
        "blockType": "short_answer", "question": "q", "userAnswer": "a",
    }).status_code == 503
    assert client.get("/api/assets/courses/demo/interactives/x.html").status_code == 503

    # Markdown 笔记导入是文档库阅读器的核心能力，不随课程插件禁用
    resp = client.post("/api/plugins/notes/import",
                       files={"file": ("n.md", b"# title", "text/markdown")})
    assert resp.status_code == 200

    # 重新启用后恢复
    client.post("/api/plugins/course/enable")
    resp = client.post("/api/plugins/course/import",
                       files={"file": ("c.zip", make_zip(), "application/zip")})
    assert resp.status_code == 200


def test_disable_kb_blocks_ask():
    r = client.post("/api/plugins/knowledge_base/disable").json()
    assert r["enabled"] is False

    resp = client.get("/api/plugins/kb/embedding-status")
    assert resp.status_code == 503
    assert "个人知识库" in resp.json()["detail"]

    resp = client.post("/api/plugins/kb/demo/ask", json={"question": "q"})
    assert resp.status_code == 503

    client.post("/api/plugins/knowledge_base/enable")
    resp = client.get("/api/plugins/kb/embedding-status")
    assert resp.status_code in (200, 503)  # 200（健康查询）或 embedding 服务未就绪的 503


def test_unknown_plugin_404():
    assert client.post("/api/plugins/nope/enable").status_code == 404
    assert client.post("/api/plugins/nope/disable").status_code == 404


def test_state_persisted_across_manager_reload():
    client.post("/api/plugins/course/disable")
    # 模拟重启：重新 configure 同一个数据目录（状态文件应保留禁用）
    manager.configure(manager.data_dir)
    info = next(p for p in manager.list() if p["id"] == "course")
    assert info["enabled"] is False
