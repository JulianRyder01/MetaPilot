"""软链接插件测试：挂载管理、浏览/读写、路径安全（防穿越/防逃逸）。"""
import os
import sys
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.plugins.base import manager
from app.services.importer import CourseImporter
from app.storage.progress import ProgressStore
from app.storage.stats import StatsStore
from app.storage.store import LibraryStore
from plugins.symlink.service import SymlinkService

client = TestClient(app)
_root_tmp: Path | None = None


def _reset():
    global _root_tmp
    _root_tmp = Path(tempfile.mkdtemp(prefix="metapilot_symlink_"))
    manager.configure(_root_tmp)
    assets = _root_tmp / "assets" / "courses"
    app.state.store = LibraryStore(_root_tmp)
    app.state.progress = ProgressStore(_root_tmp)
    app.state.stats = StatsStore(_root_tmp)
    app.state.importer = CourseImporter(app.state.store, assets)
    app.state.symlink = SymlinkService(_root_tmp)


def setup_function():
    _reset()


def _make_mount_tree() -> str:
    """在根临时目录下创建可挂载的目录并返回其路径。"""
    base = _root_tmp / "mountable"
    base.mkdir()
    (base / "docs").mkdir()
    (base / "docs" / "hello.md").write_text("# Hello\n这是内容。", encoding="utf-8")
    (base / "notes.txt").write_text("note line", encoding="utf-8")
    (base / "secret.bin").write_bytes(b"\x00\x01\x02binary")
    return str(base)


def test_mount_crud():
    root = _make_mount_tree()
    m = client.post("/api/plugins/symlink/mounts", json={"name": "我的目录", "root": root}).json()
    assert m["name"] == "我的目录"
    assert Path(m["root"]).is_absolute()
    # 列表
    mounts = client.get("/api/plugins/symlink/mounts").json()
    assert len(mounts) == 1
    # 重命名
    r = client.put(f"/api/plugins/symlink/mounts/{m['id']}", json={"name": "改名"}).json()
    assert r["name"] == "改名"
    # 卸载
    assert client.delete(f"/api/plugins/symlink/mounts/{m['id']}").status_code == 200
    assert client.get("/api/plugins/symlink/mounts").json() == []
    # 挂载不存在的路径
    r = client.post("/api/plugins/symlink/mounts", json={"name": "x", "root": str(_root_tmp / "nope")})
    assert r.status_code == 400


def test_list_read_write_mkdir_delete():
    root = _make_mount_tree()
    m = client.post("/api/plugins/symlink/mounts", json={"name": "m", "root": root}).json()
    mid = m["id"]

    # 列目录
    tree = client.get(f"/api/plugins/symlink/mounts/{mid}/tree").json()
    names = {i["name"]: i["type"] for i in tree["items"]}
    assert names["docs"] == "dir"
    assert names["notes.txt"] == "file"
    assert names["secret.bin"] == "file"
    # 子目录列目录
    sub = client.get(f"/api/plugins/symlink/mounts/{mid}/tree", params={"path": "docs"}).json()
    assert {i["name"] for i in sub["items"]} == {"hello.md"}

    # 读文件
    f = client.get(f"/api/plugins/symlink/mounts/{mid}/file", params={"path": "docs/hello.md"}).json()
    assert "Hello" in f["content"]

    # 写文件（覆盖 + 新建）
    r = client.put(f"/api/plugins/symlink/mounts/{mid}/file",
                   params={"path": "docs/hello.md"}, json={"content": "# 新内容"}).json()
    assert r["ok"] is True
    assert (Path(root) / "docs" / "hello.md").read_text(encoding="utf-8") == "# 新内容"

    # 建文件夹
    client.post(f"/api/plugins/symlink/mounts/{mid}/mkdir", json={"path": "docs/子目录"})
    assert (Path(root) / "docs" / "子目录").is_dir()

    # 删除文件
    client.delete(f"/api/plugins/symlink/mounts/{mid}/path", params={"path": "notes.txt"})
    assert not (Path(root) / "notes.txt").exists()

    # 删除文件夹（递归）
    client.delete(f"/api/plugins/symlink/mounts/{mid}/path", params={"path": "docs"})
    assert not (Path(root) / "docs").exists()


def test_security_path_traversal():
    root = _make_mount_tree()
    m = client.post("/api/plugins/symlink/mounts", json={"name": "m", "root": root}).json()
    mid = m["id"]
    outside = _root_tmp / "outside.txt"
    outside.write_text("secret", encoding="utf-8")

    # ../ 逃逸被拒绝
    r = client.get(f"/api/plugins/symlink/mounts/{mid}/file", params={"path": "../outside.txt"})
    assert r.status_code == 400
    # 绝对路径逃逸
    r = client.get(f"/api/plugins/symlink/mounts/{mid}/file", params={"path": str(outside)})
    assert r.status_code == 400
    # 写入逃逸被拒绝
    r = client.put(f"/api/plugins/symlink/mounts/{mid}/file",
                   params={"path": "../outside.txt"}, json={"content": "hacked"})
    assert r.status_code == 400
    assert outside.read_text(encoding="utf-8") == "secret"


def test_security_binary_rejected_and_404():
    root = _make_mount_tree()
    m = client.post("/api/plugins/symlink/mounts", json={"name": "m", "root": root}).json()
    mid = m["id"]
    # 二进制文件不可读
    r = client.get(f"/api/plugins/symlink/mounts/{mid}/file", params={"path": "secret.bin"})
    assert r.status_code == 400
    # 不存在的挂载
    assert client.get("/api/plugins/symlink/mounts/nope/tree").status_code == 404


@pytest.mark.skipif(sys.platform.startswith("win"), reason="Windows 上创建符号链接需要管理员权限")
def test_security_symlink_escape():
    root = _make_mount_tree()
    outside = _root_tmp / "secret.txt"
    outside.write_text("top-secret", encoding="utf-8")
    (root / "link").symlink_to(outside)
    m = client.post("/api/plugins/symlink/mounts", json={"name": "m", "root": root}).json()
    r = client.get(f"/api/plugins/symlink/mounts/{m['id']}/file", params={"path": "link"})
    assert r.status_code == 400


def test_fs_browse_roots_and_list():
    """文件选择器数据源：顶层入口 + 目录浏览。"""
    roots = client.get("/api/plugins/symlink/fs/roots").json()
    assert isinstance(roots, list) and len(roots) >= 1

    base = _root_tmp / "browse"
    base.mkdir()
    (base / "sub").mkdir()
    (base / "a.txt").write_text("hi", encoding="utf-8")

    lst = client.get("/api/plugins/symlink/fs/list", params={"path": str(base)}).json()
    assert lst["path"] == str(base)
    assert lst["parent"] == str(_root_tmp)
    by_name = {i["name"]: i for i in lst["items"]}
    assert by_name["sub"]["type"] == "dir"
    assert by_name["a.txt"]["type"] == "file"
    assert by_name["a.txt"]["path"] == str(base / "a.txt")
    # 每项都带绝对路径，可直接回填
    assert Path(by_name["a.txt"]["path"]).is_absolute()

    # 不存在的路径 → 400
    r = client.get("/api/plugins/symlink/fs/list", params={"path": str(base / "nope")})
    assert r.status_code == 400
    # 对文件列出 → 400
    r = client.get("/api/plugins/symlink/fs/list", params={"path": str(base / "a.txt")})
    assert r.status_code == 400
    # 空路径 → 400
    assert client.get("/api/plugins/symlink/fs/list").status_code == 400


def test_mount_single_file():
    """挂载单个文件：可浏览/读取/编辑该文件，禁止删除挂载根本身。"""
    f = _root_tmp / "single.md"
    f.write_text("# 单文件\n正文。", encoding="utf-8")
    m = client.post("/api/plugins/symlink/mounts", json={"name": "单文件", "root": str(f)}).json()
    assert m["type"] == "file"
    assert Path(m["root"]) == f

    # tree：返回该文件自身
    tree = client.get(f"/api/plugins/symlink/mounts/{m['id']}/tree").json()
    assert [i["name"] for i in tree["items"]] == ["single.md"]
    assert tree["items"][0]["type"] == "file"

    # 读取（路径为空 = 根文件自身）
    r = client.get(f"/api/plugins/symlink/mounts/{m['id']}/file", params={"path": ""})
    assert r.status_code == 200
    assert "单文件" in r.json()["content"]
    assert r.json()["path"] == ""

    # 编辑保存（路径为空）
    r = client.put(f"/api/plugins/symlink/mounts/{m['id']}/file",
                   params={"path": ""}, json={"content": "# 已修改"})
    assert r.status_code == 200
    assert f.read_text(encoding="utf-8") == "# 已修改"

    # 非文本文件挂载 → 挂载成功但读取被拒
    bin_f = _root_tmp / "blob.bin"
    bin_f.write_bytes(b"\x00\x01")
    mb = client.post("/api/plugins/symlink/mounts", json={"name": "bin", "root": str(bin_f)}).json()
    assert client.get(f"/api/plugins/symlink/mounts/{mb['id']}/file", params={"path": ""}).status_code == 400

    # 禁止删除挂载根文件本身
    assert client.delete(f"/api/plugins/symlink/mounts/{m['id']}/path", params={"path": ""}).status_code == 400
    assert f.exists()
    # 挂载目录时同样禁止删除根
    d = _root_tmp / "rootdir"
    d.mkdir()
    md = client.post("/api/plugins/symlink/mounts", json={"name": "d", "root": str(d)}).json()
    assert client.delete(f"/api/plugins/symlink/mounts/{md['id']}/path", params={"path": ""}).status_code == 400
    assert d.is_dir()


def test_disable_symlink_blocks_api():
    client.post("/api/plugins/symlink/disable")
    assert client.get("/api/plugins/symlink/mounts").status_code == 503
    client.post("/api/plugins/symlink/enable")
    assert client.get("/api/plugins/symlink/mounts").status_code == 200
