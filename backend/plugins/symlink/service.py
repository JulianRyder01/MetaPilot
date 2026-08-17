"""软链接插件 · 挂载服务。

挂载本机目录作为可浏览/读写的文件空间。安全约束：
- 所有路径解析后必须位于挂载根目录内（防路径穿越与符号链接逃逸）；
- 文件读写仅允许文本类扩展名（白名单），拒绝二进制；
- 写入内容限制大小，防止异常大文件；
- 媒体文件（图片/PDF/视频/音频）经独立二进制端点读取，供前端内联预览；
- 本地打开/定位文件仅限挂载根内路径，经系统命令在用户机器上执行。
"""
from __future__ import annotations

import json
import os
import shutil
import string
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import Optional

from app.services import mpf as mpf_service
from app.storage.store import _read_json, _write_json, gen_id

# 可读/可写的文本扩展名白名单（.mpf 为 MetaPilot 文档，AI 洞察可把生成结果存为 .mpf 到挂载目录；
# .canvas 为 Obsidian 原生画布文件，支持打开转 .mpf 编辑后写回）
TEXT_EXTENSIONS = {
    ".md", ".markdown", ".txt", ".text", ".json", ".yaml", ".yml",
    ".csv", ".tsv", ".log", ".xml", ".html", ".css", ".js", ".ts",
    ".py", ".toml", ".ini", ".conf", ".cfg", ".mpf", ".canvas", ".canvas",
}
# 可内联预览的媒体扩展名 → MIME（前端据此选择 <img>/<iframe>/<video>/<audio> 渲染）
MEDIA_TYPES = {
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
    ".webp": "image/webp", ".svg": "image/svg+xml", ".bmp": "image/bmp", ".ico": "image/x-icon",
    ".pdf": "application/pdf",
    ".mp4": "video/mp4", ".webm": "video/webm", ".ogg": "video/ogg", ".mov": "video/quicktime",
    ".mp3": "audio/mpeg", ".wav": "audio/wav", ".flac": "audio/flac", ".m4a": "audio/mp4",
}
MAX_WRITE_BYTES = 10 * 1024 * 1024  # 10MB
# 本地打开/定位文件的最大体积约束（仅限制读取到响应，系统打开不受此限）
MAX_MEDIA_BYTES = 50 * 1024 * 1024  # 50MB


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
                "pinned": False,
                "createdAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
            }
            data["mounts"].append(mount)
            self._save(data)
            return mount

    def rename_mount(self, mount_id: str, name: Optional[str] = None, pinned: Optional[bool] = None) -> dict:
        with self.lock:
            data = self._load()
            for m in data["mounts"]:
                if m["id"] == mount_id:
                    if name is not None:
                        m["name"] = name
                    if pinned is not None:
                        m["pinned"] = bool(pinned)
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

    # ---- JSON Canvas（.canvas）打开/写回 ----

    def read_canvas(self, mount_id: str, rel: str) -> dict:
        """打开挂载内 .canvas 源文件，转 .mpf canvas 内容（{nodes, edges}）供图表编辑器编辑。

        只读取并转换，不修改源文件；只有调用 write_canvas 才把编辑结果写回。
        """
        mount = self.get_mount(mount_id)
        target = self._resolve(mount, rel)
        if not target.is_file():
            raise MountError(f"不是文件: {rel}")
        ext = target.suffix.lower()
        if ext != ".canvas":
            raise MountError(f"仅支持打开 .canvas 文件（{ext}）")
        try:
            raw = target.read_text(encoding="utf-8", errors="replace")
            data = json.loads(raw)
        except (OSError, UnicodeError) as e:
            raise MountError(f"读取失败: {e}")
        except json.JSONDecodeError as e:
            raise MountError(f"不是有效的 .canvas 文件: {e}")
        if not isinstance(data, dict) or not (isinstance(data.get("nodes"), list) or isinstance(data.get("edges"), list)):
            raise MountError("不是有效的 .canvas 文件（缺少 nodes/edges 数组）")
        canvas = {
            "nodes": data.get("nodes", []) if isinstance(data.get("nodes"), list) else [],
            "edges": data.get("edges", []) if isinstance(data.get("edges"), list) else [],
        }
        mpf_text = mpf_service.canvas_data_to_mpf_text(data, name=target.stem)
        parsed = mpf_service.parse_mpf(mpf_text)
        if not parsed["ok"]:
            raise MountError("; ".join(parsed["errors"]))
        root = Path(mount["root"]).resolve()
        rel_path = "" if target == root else str(target.relative_to(root))
        return {
            "path": rel_path,
            "name": target.stem,
            "canvas": parsed["content"],
        }

    def write_canvas(self, mount_id: str, rel: str, nodes: list, edges: list) -> dict:
        """把编辑后的图表（.mpf canvas 内容）转为 JSON Canvas 标准文本，写回源 .canvas 文件。

        仅当前端显式保存时调用；未保存则源文件保持原样。
        """
        mount = self.get_mount(mount_id)
        target = self._resolve(mount, rel)
        if target.suffix.lower() != ".canvas":
            raise MountError(f"仅支持写回 .canvas 文件（{target.suffix or '无扩展名'}）")
        text = mpf_service.mpf_canvas_to_canvas_text({"nodes": nodes or [], "edges": edges or []})
        return self.write_file(mount_id, rel, text)

    # ---- 媒体预览与本地打开 ----

    def media_info(self, mount_id: str, rel: str) -> dict:
        """校验媒体文件并返回 {path, mime, size, name}（供二进制端点读取）。"""
        mount = self.get_mount(mount_id)
        target = self._resolve(mount, rel)
        if not target.is_file():
            raise MountError(f"不是文件: {rel or '/'}")
        ext = target.suffix.lower()
        if ext not in MEDIA_TYPES:
            raise MountError(f"不支持预览该文件类型（{ext or '无扩展名'}）")
        try:
            size = target.stat().st_size
        except OSError as e:
            raise MountError(f"读取失败: {e}")
        if size > MAX_MEDIA_BYTES:
            raise MountError(f"文件过大（>{MAX_MEDIA_BYTES // (1024 * 1024)}MB），无法内联预览")
        root = Path(mount["root"]).resolve()
        rel_path = "" if target == root else str(target.relative_to(root))
        return {"path": rel_path, "mime": MEDIA_TYPES[ext], "size": size, "name": target.name}

    def read_media(self, mount_id: str, rel: str) -> tuple[bytes, str]:
        """读取媒体文件字节与 MIME（路径已由 media_info 同源校验）。"""
        info = self.media_info(mount_id, rel)
        target = self._resolve(self.get_mount(mount_id), rel)
        try:
            return target.read_bytes(), info["mime"]
        except OSError as e:
            raise MountError(f"读取失败: {e}")

    @staticmethod
    def _system_open(path: Path, mode: str) -> None:
        """在本机打开/定位文件（非阻塞）。

        mode: reveal=在文件管理器中定位显示；open=用系统默认方式打开。
        仅接受已通过 _resolve 约束在挂载根内的绝对路径。
        """
        norm = os.path.normpath(str(path))
        if os.name == "nt":
            if mode == "reveal":
                # 参数列表方式避免 shell 注入；explorer 识别 /select,<path>
                subprocess.Popen(["explorer", f"/select,{norm}"])
            else:
                os.startfile(norm)  # 默认程序打开（立即返回）
            return
        if sys.platform == "darwin":
            cmd = ["open", "-R" if mode == "reveal" else "", norm]
            subprocess.Popen([c for c in cmd if c])
            return
        # Linux / 其它 Unix
        if mode == "reveal":
            # 无标准「在文件管理器中显示」命令，退化为打开所在目录
            subprocess.Popen(["xdg-open", os.path.normpath(str(path.parent))])
        else:
            subprocess.Popen(["xdg-open", norm])

    def open_file(self, mount_id: str, rel: str, mode: str = "open") -> dict:
        """在用户本机打开/定位挂载内的文件（mode: open | reveal）。"""
        if mode not in ("open", "reveal"):
            raise MountError("mode 仅支持 open（默认方式打开）或 reveal（在文件管理器中显示）")
        mount = self.get_mount(mount_id)
        target = self._resolve(mount, rel)
        if not target.exists():
            raise MountError(f"路径不存在: {rel or '/'}")
        try:
            self._system_open(target, mode)
        except OSError as e:
            raise MountError(f"打开失败: {e}")
        return {"ok": True, "mode": mode, "path": rel}

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
