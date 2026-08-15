"""插件商店集成测试：商店清单 / 从商店安装 / 发布 / 本地上传安装。

商店服务器用 httpx.MockTransport 模拟（不依赖真实部署）。
"""
import io
import json
import shutil
import zipfile

import httpx
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from app.plugins.base import manager
from app.plugins.loader import PLUGINS_DIR
from app.services import plugin_store

client = TestClient(app)

TEST_PID = "store_demo"

ZIP_INIT = f'''"""测试插件。"""
from app.plugins.base import Plugin


class StoreDemo(Plugin):
    id = "{TEST_PID}"

    def register(self, app):
        pass


plugin = StoreDemo()
'''


def make_zip(pid: str = TEST_PID, tags: list | None = None, frontend: str | None = None) -> bytes:
    meta = {
        "specVersion": "1.0",
        "id": pid,
        "name": "商店示例",
        "version": "1.0.0",
        "description": "商店测试插件",
        "author": "tester",
        "source": "user",
        "tags": tags or ["效率"],
    }
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("plugin.json", json.dumps(meta, ensure_ascii=False))
        zf.writestr("__init__.py", ZIP_INIT)
        if frontend is not None:
            zf.writestr("frontend/frontend.js", frontend)
    return buf.getvalue()


def _cleanup():
    plugin_store._transport = None
    manager._registry.pop(TEST_PID, None)
    manager._state.pop(TEST_PID, None)
    shutil.rmtree(PLUGINS_DIR / TEST_PID, ignore_errors=True)


def setup_function():
    _cleanup()


def _mock_store(handler) -> None:
    plugin_store._transport = httpx.MockTransport(handler)


def _store_handler(request: httpx.Request) -> httpx.Response:
    if request.url.path.endswith("/api/store/plugins") and request.method == "GET":
        return httpx.Response(200, json=[{
            "id": TEST_PID, "name": "商店示例", "version": "1.0.0",
            "description": "商店测试插件", "author": "tester", "source": "user",
            "specVersion": "1.0", "tags": ["效率"],
            "size": 1024, "downloadUrl": f"/api/store/plugins/{TEST_PID}/download",
        }])
    if request.url.path.endswith(f"/{TEST_PID}/download"):
        return httpx.Response(200, content=make_zip(), headers={"content-type": "application/zip"})
    if request.url.path.endswith("/api/store/plugins/upload") and request.method == "POST":
        return httpx.Response(200, json={"id": TEST_PID, "name": "商店示例", "version": "1.0.0"})
    return httpx.Response(404, json={"detail": "not found"})


def test_store_catalog_requires_config(monkeypatch):
    monkeypatch.setattr(settings, "plugin_store_url", "")
    r = client.get("/api/plugins/store/plugins")
    assert r.status_code == 400
    assert "PLUGIN_STORE_URL" in r.json()["detail"]


def test_store_catalog(monkeypatch):
    monkeypatch.setattr(settings, "plugin_store_url", "http://store.test:8100")
    _mock_store(_store_handler)
    r = client.get("/api/plugins/store/plugins")
    assert r.status_code == 200
    items = r.json()
    assert items[0]["id"] == TEST_PID
    assert items[0]["tags"] == ["效率"]


def test_store_install(monkeypatch):
    monkeypatch.setattr(settings, "plugin_store_url", "http://store.test:8100")
    _mock_store(_store_handler)
    r = client.post(f"/api/plugins/store/plugins/{TEST_PID}/install")
    assert r.status_code == 200
    assert r.json()["installed"] is True
    assert r.json()["id"] == TEST_PID
    # 已注册且被视为 user 插件（可删除）
    info = next(p for p in manager.list() if p["id"] == TEST_PID)
    assert info["source"] == "user"
    assert client.delete(f"/api/plugins/{TEST_PID}").status_code == 200


def test_store_install_duplicate_rejected(monkeypatch):
    monkeypatch.setattr(settings, "plugin_store_url", "http://store.test:8100")
    _mock_store(_store_handler)
    assert client.post(f"/api/plugins/store/plugins/{TEST_PID}/install").status_code == 200
    # 再次安装同一插件被拒绝
    r = client.post(f"/api/plugins/store/plugins/{TEST_PID}/install")
    assert r.status_code == 400


def test_upload_local_install():
    r = client.post("/api/plugins/upload", files={"file": ("p.zip", make_zip(), "application/zip")})
    assert r.status_code == 200
    assert r.json()["id"] == TEST_PID
    assert r.json()["source"] == "user"
    assert client.delete(f"/api/plugins/{TEST_PID}").status_code == 200


def test_upload_local_accepts_arbitrary_tag():
    # tags 为自由字符串（无白名单），第三方插件可自带任意标签
    r = client.post("/api/plugins/upload", files={"file": ("p.zip", make_zip(tags=["不存在的tag"]), "application/zip")})
    assert r.status_code == 200
    assert r.json()["id"] == TEST_PID
    assert r.json()["tags"] == ["不存在的tag"]
    assert client.delete(f"/api/plugins/{TEST_PID}").status_code == 200


def test_upload_with_frontend_bundle_served():
    """带 frontend/frontend.js 的插件：安装后清单带 frontendUrl，经托管端点返回 bundle。"""
    js = 'window.MetaPilotPluginRegistry.register({ id: "store_demo", routes: [] })'
    r = client.post("/api/plugins/upload", files={"file": ("p.zip", make_zip(frontend=js), "application/zip")})
    assert r.status_code == 200, r.text
    info = r.json()
    assert info["hasFrontend"] is True
    assert info["frontendUrl"] == "/api/plugins/store_demo/frontend.js"

    r = client.get("/api/plugins/store_demo/frontend.js")
    assert r.status_code == 200
    assert r.text == js
    assert r.headers["content-type"].startswith("application/javascript")

    # 不存在的插件 / 无 bundle 的插件 → 404
    assert client.get("/api/plugins/nope/frontend.js").status_code == 404
    assert client.delete(f"/api/plugins/{TEST_PID}").status_code == 200
    assert client.get("/api/plugins/store_demo/frontend.js").status_code == 404


def test_upload_local_rejects_traversal_id():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("plugin.json", json.dumps({
            "id": "../evil", "name": "x", "version": "1.0.0", "description": "d", "author": "t",
        }, ensure_ascii=False))
    r = client.post("/api/plugins/upload", files={"file": ("p.zip", buf.getvalue(), "application/zip")})
    assert r.status_code == 400
    # 未留下任何目录/文件
    assert not (PLUGINS_DIR / "evil").exists()
    assert not (PLUGINS_DIR.resolve().parent / "evil").exists()


def test_store_publish(monkeypatch):
    monkeypatch.setattr(settings, "plugin_store_url", "http://store.test:8100")
    _mock_store(_store_handler)
    r = client.post("/api/plugins/store/publish", files={"file": ("p.zip", make_zip(), "application/zip")})
    assert r.status_code == 200
    assert r.json()["id"] == TEST_PID
    # 发布不安装到本地
    assert manager.get(TEST_PID) is None
