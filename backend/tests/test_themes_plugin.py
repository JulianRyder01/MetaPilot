"""主题插件测试：清单包含、主题数据完整性、启用/禁用门禁（503 + 提示）。"""
import tempfile
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app
from app.plugins.base import manager
from app.storage.store import LibraryStore

from plugins.themes.themes_data import COMMON_KEYS, THEMES, validate_theme

client = TestClient(app)


def _reset():
    tmp = Path(tempfile.mkdtemp(prefix="metapilot_themes_"))
    manager.configure(tmp)
    app.state.store = LibraryStore(tmp)


def setup_function():
    _reset()


def test_theme_data_is_valid():
    """全部主题数据通过完整性校验（变量集合与 COMMON_KEYS 一致）。"""
    for theme in THEMES:
        validate_theme(theme)
    assert len(THEMES) == 5


def test_plugin_list_contains_themes():
    r = client.get("/api/plugins")
    assert r.status_code == 200
    info = next((p for p in r.json() if p["id"] == "themes"), None)
    assert info is not None
    assert info["name"] == "主题"
    assert info["enabled"] is True
    assert info["dependsOn"] == []


def test_list_themes_when_enabled():
    r = client.get("/api/plugins/themes")
    assert r.status_code == 200
    themes = r.json()
    assert len(themes) == 5
    ids = [t["id"] for t in themes]
    assert "chinese" in ids
    assert "vaporwave" in ids
    assert "bamboo" in ids
    assert "business" in ids
    assert "starry" in ids
    for t in themes:
        assert t["name"] and t["description"]
        assert t["preview"]["bg"] and t["preview"]["primary"]
        for mode in ("light", "dark"):
            assert set(t["variables"][mode].keys()) == set(COMMON_KEYS)


def test_disable_themes_blocks_list():
    r = client.post("/api/plugins/themes/disable").json()
    assert r["enabled"] is False

    resp = client.get("/api/plugins/themes")
    assert resp.status_code == 503
    detail = resp.json()["detail"]
    assert "主题" in detail
    assert "启用" in detail

    # 重新启用后恢复
    client.post("/api/plugins/themes/enable")
    resp = client.get("/api/plugins/themes")
    assert resp.status_code == 200
