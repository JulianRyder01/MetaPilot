"""插件商店自测：清单 / 上传校验 / 下载。"""
import io
import json
import zipfile

from fastapi.testclient import TestClient

from store.catalog import PACKAGES_DIR, save_index
from store.main import app

client = TestClient(app)


def make_zip(meta_override: dict | None = None) -> bytes:
    meta = {
        "specVersion": "1.0",
        "id": "demo_plugin",
        "name": "示例插件",
        "version": "1.0.0",
        "description": "演示用插件",
        "author": "tester",
        "source": "user",
        "tags": ["效率"],
    }
    if meta_override:
        meta.update(meta_override)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("plugin.json", json.dumps(meta, ensure_ascii=False))
        zf.writestr("__init__.py", "class Demo: pass\n")
    return buf.getvalue()


def setup_function():
    # 清空 packages 并重置清单，保证测试隔离
    for f in PACKAGES_DIR.glob("*.zip"):
        f.unlink()
    save_index([])


def test_upload_list_download_roundtrip():
    r = client.post("/api/store/plugins/upload", files={"file": ("demo.zip", make_zip(), "application/zip")})
    assert r.status_code == 200
    assert r.json()["id"] == "demo_plugin"

    items = client.get("/api/store/plugins").json()
    assert any(i["id"] == "demo_plugin" and i["tags"] == ["效率"] for i in items)

    d = client.get("/api/store/plugins/demo_plugin/download")
    assert d.status_code == 200
    assert d.headers["content-type"] == "application/zip"
    # 下载内容与上传一致
    assert d.content == make_zip()


def test_upload_accepts_single_dir_package():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("demo_plugin/plugin.json", json.dumps({
            "id": "demo_plugin", "name": "示例", "version": "1.0.0",
            "description": "d", "author": "t", "source": "user", "tags": [],
        }, ensure_ascii=False))
    r = client.post("/api/store/plugins/upload", files={"file": ("d.zip", buf.getvalue(), "application/zip")})
    assert r.status_code == 200


def test_upload_rejects_bad_tag():
    r = client.post("/api/store/plugins/upload", files={"file": ("b.zip", make_zip({"tags": ["不存在的tag"]}), "application/zip")})
    assert r.status_code == 400


def test_upload_rejects_missing_required_field():
    r = client.post("/api/store/plugins/upload", files={"file": ("c.zip", make_zip({"id": ""}), "application/zip")})
    assert r.status_code == 400


def test_upload_rejects_traversal_id():
    r = client.post("/api/store/plugins/upload", files={"file": ("e.zip", make_zip({"id": "../evil"}), "application/zip")})
    assert r.status_code == 400


def test_upload_rejects_non_zip():
    r = client.post("/api/store/plugins/upload", files={"file": ("f.zip", b"not a zip", "application/zip")})
    assert r.status_code == 400


def test_download_missing_plugin_404():
    assert client.get("/api/store/plugins/nope/download").status_code == 404
