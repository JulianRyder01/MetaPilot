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
    assert "core" in ids
    assert "course" in ids
    assert "knowledge_base" in ids
    for p in plugins:
        assert "enabled" in p
        assert "description" in p
        assert "dependsOn" in p
        assert "source" in p
        assert "locked" in p
        assert "removable" in p


def test_plugin_classification():
    by_id = {p["id"]: p for p in client.get("/api/plugins").json()}
    # 官方核心：不可禁用、不可删除
    core = by_id["core"]
    assert core["source"] == "core"
    assert core["locked"] is True
    assert core["removable"] is False
    assert core["enabled"] is True
    # 官方插件：可禁用、不可删除
    course = by_id["course"]
    assert course["source"] == "official"
    assert course["locked"] is False
    assert course["removable"] is False
    # 禁用核心被拒绝（核心不在注册表，按 404 处理）
    assert client.post("/api/plugins/core/disable").status_code == 404
    # 删除官方插件被拒绝
    assert client.delete("/api/plugins/course").status_code == 400


def test_user_plugin_removable():
    from app.plugins.base import Plugin, manager

    class FakeUserPlugin(Plugin):
        id = "fake_user_plugin"
        name = "测试用户插件"
        source = "user"

    manager.register(FakeUserPlugin())
    # 用户插件可禁用
    r = client.post("/api/plugins/fake_user_plugin/disable").json()
    assert r["enabled"] is False
    assert r["removable"] is True
    # 用户插件可删除（物理目录不存在时跳过删除）
    assert client.delete("/api/plugins/fake_user_plugin").status_code == 200
    assert "fake_user_plugin" not in [p["id"] for p in client.get("/api/plugins").json()]
    # 删除后 404
    assert client.delete("/api/plugins/fake_user_plugin").status_code == 404


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


# ---------------- 插件开发规范 v1.0（docs/04）：specVersion / 单一元数据源 / 旧格式兼容 ----------------

def test_plugin_list_includes_spec_version():
    plugins = client.get("/api/plugins").json()
    ids = [p["id"] for p in plugins]
    assert "core" in ids and "course" in ids and "knowledge_base" in ids
    for p in plugins:
        assert "specVersion" in p
    core = next(p for p in plugins if p["id"] == "core")
    assert core["specVersion"] == "1.0"
    course = next(p for p in plugins if p["id"] == "course")
    assert course["specVersion"] == "1.0"


def test_plugin_metadata_source_is_plugin_json():
    # plugin.json 为唯一元数据源：真实插件元数据来自 plugin.json，类上不再重复声明
    p = manager.get("course")
    assert p is not None
    assert p.name == "课程"
    assert p.description.startswith("课程包")
    assert p.author == "MetaPilot"
    assert p.source == "official"
    assert p.spec_version == "1.0"

    from plugins.course import CoursePlugin

    assert "name" not in CoursePlugin.__dict__
    assert "version" not in CoursePlugin.__dict__
    assert "source" not in CoursePlugin.__dict__


def test_apply_metadata_spec_version_defaults(tmp_path):
    # 旧格式 plugin.json 缺 specVersion / 缺字段：回退默认值（向后兼容）
    from app.plugins.base import Plugin
    from app.plugins.loader import _apply_metadata

    class Bare(Plugin):
        id = "bare"

    meta = tmp_path / "plugin.json"
    meta.write_text('{"id": "bare", "name": "裸插件", "source": "user"}', encoding="utf-8")
    p = Bare()
    _apply_metadata(p, meta)
    assert p.id == "bare"
    assert p.name == "裸插件"
    assert p.source == "user"
    assert p.spec_version == "1.0"   # 缺省视为 1.0
    assert p.version == "1.0.0"      # 缺省回退类默认
    assert p.depends_on == []        # 缺省回退类默认


def test_legacy_plugin_without_plugin_json_still_loads():
    # 旧格式插件（无 plugin.json，元数据在类上）仍能注册与列出（宽松向后兼容）
    from app.plugins.base import Plugin

    class LegacyPlugin(Plugin):
        id = "legacy_plugin"
        name = "旧格式插件"
        version = "0.9.0"
        source = "user"

    manager.register(LegacyPlugin())
    try:
        info = next(p for p in manager.list() if p["id"] == "legacy_plugin")
        assert info["name"] == "旧格式插件"
        assert info["version"] == "0.9.0"
        assert info["specVersion"] == "1.0"
        assert client.get("/api/plugins").status_code == 200
    finally:
        manager._registry.pop("legacy_plugin", None)
