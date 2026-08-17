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

# 测试环境不自动拉起真实 embedding 服务进程
from app.config import settings

settings.embedding_auto_start = False

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
    assert "ai_insight" in ids
    for p in plugins:
        assert "enabled" in p
        assert "description" in p
        assert "dependsOn" in p
        assert "source" in p
        assert "locked" in p
        assert "removable" in p
        # 教程字段（schema v1.7）：每个插件均返回 tutorials（可能为空），结构统一
        assert "tutorials" in p


def test_plugin_tutorials():
    """插件自带使用教程（schema v1.7）：清单下发 tutorials，核心自带教程且结构合法。"""
    by_id = {p["id"]: p for p in client.get("/api/plugins").json()}
    core = by_id["core"]
    assert isinstance(core["tutorials"], list) and len(core["tutorials"]) > 0
    ids = set()
    for item in core["tutorials"]:
        assert set(item) >= {"id", "title", "content"}
        assert isinstance(item["title"], str) and item["title"].strip()
        assert isinstance(item["content"], str) and item["content"].strip()
        ids.add(item["id"])
    assert len(ids) == len(core["tutorials"]), "教程 id 必须唯一"
    # 未声明教程的字段缺省为空列表；course 插件声明了自己的教程
    assert "tutorials" in by_id["course"] and isinstance(by_id["course"]["tutorials"], list)
    course_ids = [t["id"] for t in by_id["course"]["tutorials"]]
    assert course_ids == ["course-create-import", "course-edit-distribute"]


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
    assert "交互式学习" in resp.json()["detail"]
    assert "启用" in resp.json()["detail"]

    assert client.get("/api/plugins/course/progress/demo").status_code == 503
    assert client.get("/api/plugins/course/stats/summary").status_code == 503
    assert client.post("/api/plugins/course/ai/grade", json={
        "blockType": "short_answer", "question": "q", "userAnswer": "a",
    }).status_code == 503
    assert client.get("/api/plugins/course/assets/demo/interactives/x.html").status_code == 503

    # Markdown 笔记导入是文档库阅读器的核心能力，不随课程插件禁用
    resp = client.post("/api/plugins/notes/import",
                       files={"file": ("n.md", b"# title", "text/markdown")})
    assert resp.status_code == 200

    # 重新启用后恢复
    client.post("/api/plugins/course/enable")
    resp = client.post("/api/plugins/course/import",
                       files={"file": ("c.zip", make_zip(), "application/zip")})
    assert resp.status_code == 200


def test_convert_document_collection_to_course():
    """文档集转课程：课程=打了补丁的文档（kind=course + 转换标记）；图表/已转/禁用门禁均拒绝。"""
    lib = client.post("/api/libraries", json={"name": "库A"}).json()
    # 核心创建笔记文档集（默认 kind=note）
    note = client.post(f"/api/libraries/{lib['id']}/collections", json={"name": "我的笔记", "kind": "note"}).json()
    assert note["kind"] == "note"

    # 课程插件端点：转为课程（补丁 kind + convertedFrom/convertedAt）
    r = client.post(f"/api/plugins/course/collections/{note['id']}/convert")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is True
    assert body["collection"]["kind"] == "course"
    assert body["collection"]["convertedFrom"] == "note"
    assert body["collection"]["convertedAt"]

    # 已是课程：拒绝
    assert client.post(f"/api/plugins/course/collections/{note['id']}/convert").status_code == 400
    # 图表不能转课程
    canvas = client.post(f"/api/libraries/{lib['id']}/collections", json={"name": "图", "kind": "canvas"}).json()
    assert client.post(f"/api/plugins/course/collections/{canvas['id']}/convert").status_code == 400
    # 不存在：404
    assert client.post("/api/plugins/course/collections/nope/convert").status_code == 404
    # 禁用课程插件：503（requires_plugin 门禁）
    client.post("/api/plugins/course/disable")
    try:
        assert client.post(f"/api/plugins/course/collections/{canvas['id']}/convert").status_code == 503
    finally:
        client.post("/api/plugins/course/enable")


def test_disable_ai_insight_blocks_ask():
    r = client.post("/api/plugins/ai_insight/disable").json()
    assert r["enabled"] is False

    resp = client.get("/api/plugins/ai_insight/embedding-status")
    assert resp.status_code == 503
    assert "AI 洞察" in resp.json()["detail"]

    # 禁用后 /ask 与 /resources 均返回 503
    resp = client.post("/api/plugins/ai_insight/ask",
                       json={"sources": [{"type": "library", "id": "demo"}], "mode": "assist", "question": "q"})
    assert resp.status_code == 503
    assert client.get("/api/plugins/ai_insight/resources").status_code == 503

    client.post("/api/plugins/ai_insight/enable")
    resp = client.get("/api/plugins/ai_insight/embedding-status")
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
    assert "core" in ids and "course" in ids and "ai_insight" in ids
    for p in plugins:
        assert "specVersion" in p
    core = next(p for p in plugins if p["id"] == "core")
    assert core["specVersion"] == "1.0"
    course = next(p for p in plugins if p["id"] == "course")
    assert course["specVersion"] == "1.1"


def test_capability_registry():
    """能力注册表：插件声明的能力可查询/检测可用性；块类型从插件 content_types 反查，核心不写死映射。"""
    # 能力由加载器从 plugin.json capabilities 字段注册
    cap = manager.capability("symlink.mounts")
    assert cap and cap["provider"] == "symlink"
    assert manager.capability_available("symlink.mounts") is True
    assert manager.provider_for_capability("symlink.mounts") == "symlink"
    assert manager.capability("nope.cap") is None
    assert manager.capability_available("nope.cap") is False

    # ai_insight 声明需要 symlink.mounts（可选能力），当前可用 → missingCapabilities 为空
    info = next(p for p in client.get("/api/plugins").json() if p["id"] == "ai_insight")
    assert "symlink.mounts" in info["requires"]
    assert info["missingCapabilities"] == []

    # 禁用提供方后能力不可用 → ai_insight 的 missingCapabilities 出现该项
    client.post("/api/plugins/symlink/disable")
    try:
        info = next(p for p in client.get("/api/plugins").json() if p["id"] == "ai_insight")
        assert "symlink.mounts" in info["missingCapabilities"]
    finally:
        client.post("/api/plugins/symlink/enable")

    # 块类型反查：课程插件声明 → course；未声明类型 → 空（核心不再写死映射）
    assert manager.plugin_for_block_type("single_choice") == "course"
    assert manager.plugin_for_block_type("interactive") == "course"
    assert manager.plugin_for_block_type("markdown") == ""


def test_capability_service_registry():
    """能力服务注册表：插件可把服务对象注册进能力，经 capability 取用而非 app.state 属性。"""
    # 自包含测试（不依赖其它测试文件的全局服务残留）
    manager.register_service("symlink.mounts", object())
    try:
        assert manager.service_for_capability("symlink.mounts") is not None
    finally:
        manager._services.pop("symlink.mounts", None)
    assert manager.service_for_capability("nope.cap") is None


def test_collection_kinds_registry():
    """kind 元数据注册表：核心类型 + 插件声明合并，kind→打开路由由插件声明不写死。"""
    r = client.get("/api/collection-kinds")
    assert r.status_code == 200, r.text
    kinds = r.json()
    # 核心类型
    assert kinds["canvas"]["openRoute"] == "/canvas/{id}"
    assert kinds["note"]["openRoute"] == "/edit/{id}"
    assert "icon" in kinds["canvas"]
    # course 类型由课程插件声明（含打开路由与归属插件）
    assert kinds["course"]["openRoute"] == "/course/{id}"
    assert kinds["course"]["pluginId"] == "course"
    assert kinds["course"]["icon"] == "GraduationCap"


def test_plugin_metadata_source_is_plugin_json():
    # plugin.json 为唯一元数据源：真实插件元数据来自 plugin.json，类上不再重复声明
    p = manager.get("course")
    assert p is not None
    assert p.name == "交互式学习"
    assert p.description.startswith("交互式学习")
    assert p.author == "MetaPilot"
    assert p.source == "official"
    assert p.spec_version == "1.1"
    # schema v1.2 元数据字段：能力/块类型/功能列表/图标
    assert p.content_types == ["single_choice", "multiple_choice", "fill_blank", "short_answer", "interactive"]
    assert "course.learning" in p.capabilities
    assert p.features and p.icon == "GraduationCap"

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


# ---------------- 分类顺序与 tags（docs/04 §2 / §3.2） ----------------

def test_plugin_list_ordered_user_official_core():
    from app.plugins.base import Plugin

    class FakeUserPlugin(Plugin):
        id = "zz_user_plugin"
        name = "用户插件"
        source = "user"

    manager.register(FakeUserPlugin())
    try:
        plugins = client.get("/api/plugins").json()
        srcs = [p["source"] for p in plugins]
        assert srcs.index("user") < srcs.index("official"), "用户自定义插件应在官方插件之前"
        assert srcs.index("official") < srcs.index("core"), "官方插件应在官方核心之前"
        assert plugins[-1]["id"] == "core", "官方核心应排在最后"
    finally:
        manager._registry.pop("zz_user_plugin", None)


def test_plugin_list_includes_tags():
    # tags 为自由字符串（无白名单），第三方插件可自带任意标签
    plugins = client.get("/api/plugins").json()
    for p in plugins:
        assert "tags" in p, f"插件 {p['id']} 缺少 tags 字段"
        assert isinstance(p["tags"], list)
        for t in p["tags"]:
            assert isinstance(t, str) and t
    by_id = {p["id"]: p for p in plugins}
    assert by_id["course"]["tags"] == ["学习"]
    assert by_id["ai_insight"]["tags"] == ["学习", "AI"]
    assert by_id["themes"]["tags"] == ["主题"]
    assert by_id["symlink"]["tags"] == ["工具", "存储"]
    assert by_id["core"]["tags"] == []


def test_plugin_info_includes_metadata_v12():
    """/api/plugins 清单透传 v1.2 元数据：features/icon/capabilities/requires/contentTypes。"""
    by_id = {p["id"]: p for p in client.get("/api/plugins").json()}
    course = by_id["course"]
    assert course["icon"] == "GraduationCap"
    assert course["features"] and all(isinstance(f, str) for f in course["features"])
    assert "course.learning" in course["capabilities"]
    assert "single_choice" in course["contentTypes"]
    assert by_id["symlink"]["icon"] == "FolderOpen"
    assert "symlink.mounts" in by_id["symlink"]["capabilities"]
    assert "symlink.mounts" in by_id["ai_insight"]["requires"]


def test_plugin_list_includes_changelog():
    """插件清单携带更新历史（changelog）：官方核心内置多版本，官方插件至少一条。"""
    by_id = {p["id"]: p for p in client.get("/api/plugins").json()}
    # 官方核心：内置 1.0.0 → … → 当前版本历史，倒序（最新在前）；当前版本 = 项目版本单一来源
    core = by_id["core"]
    assert isinstance(core["changelog"], list) and len(core["changelog"]) >= 3
    assert core["changelog"][0]["version"] == core["version"]
    assert all("version" in c and "summary" in c for c in core["changelog"])
    # 官方插件：来自 plugin.json，至少一条，含 version/summary 字段
    for pid in ("course", "symlink", "themes", "ai_insight"):
        p = by_id[pid]
        assert isinstance(p["changelog"], list) and len(p["changelog"]) >= 1
        assert p["changelog"][0]["version"] == p["version"]
        assert p["changelog"][0]["summary"].strip() != ""
