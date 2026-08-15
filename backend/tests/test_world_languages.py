"""世界语言插件（用户自定义插件）验收测试：zip 现场打包 → 上传安装 → 语言目录接口全链路。

插件源码位于 examples/world-languages-plugin/，测试从源码现场打包（源码即包），
验证：上传安装（POST /api/plugins/upload）、前端 bundle 托管、语言目录数据完整性、
门禁（禁用 503 / 删除 404）与清理。全程真实交互，无 mock。
"""
import io
import shutil
import zipfile
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app
from app.plugins.base import manager
from app.plugins.loader import PLUGINS_DIR

client = TestClient(app)

PID = "world_languages"
PLUGIN_SRC = Path(__file__).resolve().parents[2] / "examples" / "world-languages-plugin"

PACK_FILES = [
    "plugin.json",
    "__init__.py",
    "routes.py",
    "languages.py",
    "frontend/frontend.js",
]


def make_zip() -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        for name in PACK_FILES:
            zf.write(PLUGIN_SRC / name, name)
    return buf.getvalue()


def _cleanup():
    manager._registry.pop(PID, None)
    manager._state.pop(PID, None)
    shutil.rmtree(PLUGINS_DIR / PID, ignore_errors=True)


def setup_function():
    _cleanup()


def teardown_module():
    _cleanup()


def test_install_catalog_and_delete():
    """上传安装 → 清单/frontendUrl → 语言目录数据（含抽查）→ 删除后 404。"""
    r = client.post("/api/plugins/upload", files={"file": ("wl.zip", make_zip(), "application/zip")})
    assert r.status_code == 200, r.text
    info = r.json()
    assert info["id"] == PID
    assert info["source"] == "user"
    assert info["hasFrontend"] is True
    assert info["frontendUrl"] == f"/api/plugins/{PID}/frontend.js"

    # 前端 bundle 由后端托管
    r = client.get(f"/api/plugins/{PID}/frontend.js")
    assert r.status_code == 200
    assert "MetaPilotPluginRegistry" in r.text

    # 语言目录：真实数据（前端页面实时拉取此接口）
    r = client.get(f"/api/plugins/{PID}/languages")
    assert r.status_code == 200
    data = r.json()
    langs = data["languages"]
    assert data["count"] == len(langs) >= 100

    codes = [it["code"] for it in langs]
    assert len(codes) == len(set(codes)), "语言 code 必须唯一"
    for it in langs:
        assert it["autonym"].strip(), it
        assert all(it["names"].get(k) for k in ("zh-CN", "zh-TW", "en")), it
        assert it["region"], it

    by = {it["code"]: it for it in langs}
    # 抽查展示格式数据：中文界面「英语（English）」、繁体「日語（日本語）」、世界语英文称呼
    en = by["en"]
    assert en["names"]["zh-CN"] == "英语"
    assert en["autonym"] == "English"
    ja = by["ja"]
    assert ja["names"]["zh-TW"] == "日語"
    assert ja["autonym"] == "日本語"
    assert by["eo"]["names"]["en"] == "Esperanto"

    # 删除用户插件 → 物理移除，接口 404
    assert client.delete(f"/api/plugins/{PID}").status_code == 200
    assert client.get(f"/api/plugins/{PID}/languages").status_code == 404
    assert not (PLUGINS_DIR / PID).exists()


def test_disabled_plugin_gate_returns_503():
    """禁用插件后语言接口返回 503 + 启用提示；重新启用后恢复。"""
    assert client.post("/api/plugins/upload", files={"file": ("wl.zip", make_zip(), "application/zip")}).status_code == 200

    assert client.post(f"/api/plugins/{PID}/disable").status_code == 200
    r = client.get(f"/api/plugins/{PID}/languages")
    assert r.status_code == 503
    assert "启用" in r.json()["detail"]

    assert client.post(f"/api/plugins/{PID}/enable").status_code == 200
    assert client.get(f"/api/plugins/{PID}/languages").status_code == 200

    assert client.delete(f"/api/plugins/{PID}").status_code == 200
