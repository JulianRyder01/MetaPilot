"""软链接插件 · 挂载服务。

挂载本机目录作为可浏览/读写的文件空间。安全约束：
- 所有路径解析后必须位于挂载根目录内（防路径穿越与符号链接逃逸）；
- 文件读写仅允许文本类扩展名（白名单），拒绝二进制；
- 写入内容限制大小，防止异常大文件。
"""
from __future__ import annotations

import json
import os
import shutil
import string
import threading
import time
from pathlib import Path
from typing import Optional

from app.storage.store import _read_json, _write_json, gen_id

# 可读/可写的文本扩展名白名单
TEXT_EXTENSIONS = {
    ".md", ".markdown", ".txt", ".text", ".json", ".yaml", ".yml",
    ".csv", ".tsv", ".log", ".xml", ".html", ".css", ".js", ".ts",
    ".py", ".toml", ".ini", ".conf", ".cfg",
}
MAX_WRITE_BYTES = 10 * 1024 * 1024  # 10MB


class MountError(ValueError):
    pass


class SymlinkService:
    def __init__(self, data_dir: str | Path):
        self.path = Path(data_dir) / "mounts.json"
        self.lock = threading.Lock()

    def _load(self) -> dict:
        return _read_json(self.path, {"mounts": []})

    def _save(self, data: dict) -> None:
        _write_json(self.path, data)

    # ---- 本机文件系统浏览（供前端文件选择器使用）----

    @staticmethod
    def fs_roots() -> list[str]:
        """返回文件选择器的顶层入口：Windows 为存在的盘符，Unix 为根目录 /。"""
        if os.name == "nt":
            return [f"{c}:\\" for c in string.ascii_uppercase if Path(f"{c}:\\").exists()]
        return ["/"]

    @staticmethod
    def fs_list(path: str) -> dict:
        """列出本机某个绝对目录的内容，供文件选择器导航。

        返回 items 每项带绝对路径 path，前端可直接回填/提交。
        """
        if not path or not path.strip():
            raise MountError("缺少目录路径")
        target = Path(path).expanduser()
        if not target.exists():
            raise MountError(f"路径不存在: {path}")
        if not target.is_dir():
            raise MountError(f"不是文件夹: {path}")
        items = []
        try:
            entries = sorted(target.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower()))
        except PermissionError:
            raise MountError("无权限访问该文件夹")
        except OSError as e:
            raise MountError(f"无法访问该文件夹: {e}")
        for p in entries:
            try:
                is_dir = p.is_dir()
                stat = p.stat()
                items.append({
                    "name": p.name,
                    "type": "dir" if is_dir else "file",
                    "size": stat.st_size if not is_dir else 0,
                    "mtime": int(stat.st_mtime),
                    "path": str(p),
                })
            except OSError:
                continue
        return {"path": str(target), "parent": str(target.parent), "items": items}

    # ---- 挂载管理 ----

    def list_mounts(self) -> list[dict]:
        return self._load()["mounts"]

    def get_mount(self, mount_id: str) -> dict:
        for m in self._load()["mounts"]:
            if m["id"] == mount_id:
                return m
        raise KeyError(f"挂载不存在: {mount_id}")

    def add_mount(self, name: str, root: str) -> dict:
        if not root or not root.strip():
            raise MountError("路径不能为空")
        root_path = Path(root).expanduser()
        if not root_path.exists():
            raise MountError(f"路径不存在: {root}")
        if not (root_path.is_dir() or root_path.is_file()):
            raise MountError(f"不是文件夹或文件: {root}")
        with self.lock:
            data = self._load()
            mount = {
                "id": gen_id(),
                "name": name,
                "root": str(root_path.resolve()),
                "type": "dir" if root_path.is_dir() else "file",
                "createdAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
            }
            data["mounts"].append(mount)
            self._save(data)
            return mount

    def rename_mount(self, mount_id: str, name: str) -> dict:
        with self.lock:
            data = self._load()
            for m in data["mounts"]:
                if m["id"] == mount_id:
                    m["name"] = name
                    self._save(data)
                    return m
            raise KeyError(f"挂载不存在: {mount_id}")

    def remove_mount(self, mount_id: str) -> None:
        with self.lock:
            data = self._load()
            data["mounts"] = [m for m in data["mounts"] if m["id"] != mount_id]
            self._save(data)

    # ---- 路径安全 ----

    @staticmethod
    def _resolve(mount: dict, rel: str) -> Path:
        """把挂载内相对路径解析为绝对路径，并强制约束在挂载根内。"""
        root = Path(mount["root"]).resolve()
        target = (root / rel.lstrip("/\\")).resolve()
        if target != root and not target.is_relative_to(root):
            raise MountError("路径超出挂载根目录，已拒绝访问")
        return target

    # ---- 文件系统操作 ----

    def list_dir(self, mount_id: str, rel: str = "") -> dict:
        mount = self.get_mount(mount_id)
        target = self._resolve(mount, rel)
        if not target.exists():
            raise MountError(f"路径不存在: {rel or '/'}")
        # 挂载根是单个文件时：返回该文件自身作为唯一条目
        if target.is_file():
            items = []
            try:
                stat = target.stat()
                items.append({
                    "name": target.name,
                    "type": "file",
                    "size": stat.st_size,
                    "mtime": int(stat.st_mtime),
                })
            except OSError as e:
                raise MountError(f"读取失败: {e}")
            return {"path": rel or "/", "items": items}
        items = []
        try:
            entries = sorted(target.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower()))
        except PermissionError:
            raise MountError("无权限访问该目录")
        for p in entries:
            try:
                is_dir = p.is_dir()
                stat = p.stat()
                items.append({
                    "name": p.name,
                    "type": "dir" if is_dir else "file",
                    "size": stat.st_size if not is_dir else 0,
                    "mtime": int(stat.st_mtime),
                })
            except OSError:
                continue
        return {"path": rel or "/", "items": items}

    def read_file(self, mount_id: str, rel: str) -> dict:
        mount = self.get_mount(mount_id)
        target = self._resolve(mount, rel)
        if not target.is_file():
            raise MountError(f"不是文件: {rel}")
        ext = target.suffix.lower()
        if ext not in TEXT_EXTENSIONS:
            raise MountError(f"仅支持文本文件（{ext}），二进制文件暂不可预览")
        try:
            content = target.read_text(encoding="utf-8", errors="replace")
        except (OSError, UnicodeError) as e:
            raise MountError(f"读取失败: {e}")
        root = Path(mount["root"]).resolve()
        rel_path = "" if target == root else str(target.relative_to(root))
        return {"path": rel_path, "content": content}

    def write_file(self, mount_id: str, rel: str, content: str) -> dict:
        mount = self.get_mount(mount_id)
        target = self._resolve(mount, rel)
        ext = target.suffix.lower()
        if ext not in TEXT_EXTENSIONS:
            raise MountError(f"仅允许写入文本文件（{ext}）")
        data = content.encode("utf-8")
        if len(data) > MAX_WRITE_BYTES:
            raise MountError(f"文件过大（>{MAX_WRITE_BYTES // (1024 * 1024)}MB）")
        try:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
            # TOCTOU 缓解：写入后复核真实路径仍位于挂载根内（防路径被替换为外部符号链接）
            if not target.resolve().is_relative_to(Path(mount["root"]).resolve()):
                raise MountError("写入目标已被替换为挂载根之外的路径，已拒绝")
        except MountError:
            raise
        except OSError as e:
            raise MountError(f"写入失败: {e}")
        return {"ok": True, "path": rel, "bytes": len(data)}

    def mkdir(self, mount_id: str, rel: str) -> dict:
        mount = self.get_mount(mount_id)
        target = self._resolve(mount, rel)
        if target.exists():
            raise MountError(f"路径已存在: {rel}")
        try:
            target.mkdir(parents=False)
        except OSError as e:
            raise MountError(f"创建失败: {e}")
        return {"ok": True, "path": rel}

    def delete_path(self, mount_id: str, rel: str) -> dict:
        mount = self.get_mount(mount_id)
        target = self._resolve(mount, rel)
        if not target.exists():
            raise MountError(f"路径不存在: {rel}")
        # 不允许删除挂载根本身（目录或文件），防止误删
        if target == Path(mount["root"]).resolve():
            raise MountError("不能删除挂载根本身")
        try:
            if target.is_dir():
                self._rmtree_no_follow(target)
            else:
                target.unlink()
        except OSError as e:
            raise MountError(f"删除失败: {e}")
        return {"ok": True, "path": rel}

    @staticmethod
    def _rmtree_no_follow(path: Path) -> None:
        """递归删除目录，绝不跟随符号链接：符号链接只删除链接本身。"""
        for child in path.iterdir():
            if child.is_symlink():
                child.unlink()
            elif child.is_dir():
                SymlinkService._rmtree_no_follow(child)
            else:
                child.unlink()
        path.rmdir()
