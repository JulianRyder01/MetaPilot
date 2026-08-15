"""用户插件安装：校验插件包、安全解压到 backend/plugins/<id>/、运行时注册立即生效。

校验规则与独立部署的 plugins-store（plugins-store/store/validation.py）保持一致，
见 docs/04-插件开发规范.md §3.2。
"""
from __future__ import annotations

import importlib
import io
import json
import re
import shutil
import zipfile
from pathlib import Path

from fastapi import FastAPI

from .base import Plugin, manager
from .loader import PLUGINS_DIR, _apply_metadata

_ID_RE = re.compile(r"^[a-z][a-z0-9_]*$")
_REQUIRED = ("id", "name", "version", "description", "author")


class PluginInstallError(Exception):
    """插件包安装失败。"""


def parse_plugin_meta(data: bytes) -> dict:
    """校验插件包（zip）并返回规范化元数据。"""
    try:
        zf = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile as e:
        raise PluginInstallError("不是有效的 zip 文件") from e

    names = zf.namelist()
    root = next((n for n in names if n == "plugin.json"), None)
    if root is None:
        cands = [n for n in names if n.endswith("plugin.json") and n.count("/") == 1]
        if len(cands) == 1:
            root = cands[0]
        else:
            raise PluginInstallError("包内缺少根目录 plugin.json")

    try:
        meta = json.loads(zf.read(root).decode("utf-8"))
    except Exception as e:
        raise PluginInstallError("plugin.json 解析失败") from e

    if not isinstance(meta, dict):
        raise PluginInstallError("plugin.json 必须是 JSON 对象")
    for k in _REQUIRED:
        if not meta.get(k):
            raise PluginInstallError(f"plugin.json 缺少必填字段: {k}")

    pid = meta["id"]
    if not _ID_RE.match(pid) or ".." in pid or "/" in pid or "\\" in pid:
        raise PluginInstallError("id 必须为小写字母开头的小写下划线格式，且不含非法字符")

    src = meta.get("source", "user")
    if src not in ("core", "official", "user"):
        raise PluginInstallError("source 必须是 core/official/user")

    # tags 为自由字符串（无白名单），第三方插件可自带任意标签

    meta.setdefault("source", "user")
    meta.setdefault("specVersion", "1.0")
    meta.setdefault("tags", [])
    meta.setdefault("depends_on", [])
    return meta


def extract_package(data: bytes, pid: str) -> Path:
    """安全解压到 backend/plugins/<pid>/：防 zip slip（路径越界）、防覆盖已存在插件。"""
    plugins_root = PLUGINS_DIR.resolve()
    target = (plugins_root / pid).resolve()
    if not target.is_relative_to(plugins_root) or target == plugins_root:
        raise PluginInstallError("非法插件 id")
    if target.exists():
        raise PluginInstallError(f"插件 {pid} 已存在（可先删除旧插件再安装）")

    target.mkdir(parents=True)
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            for info in zf.infolist():
                if info.is_dir():
                    continue
                dest = (target / info.filename).resolve()
                if not dest.is_relative_to(target):
                    raise PluginInstallError(f"包内路径越界: {info.filename}")
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(zf.read(info.filename))
    except Exception:
        shutil.rmtree(target, ignore_errors=True)
        raise
    return target


def install_user_plugin(app: FastAPI, data: bytes) -> dict:
    """校验 → 解压 → 运行时注册为 user 插件（立即生效，无需重启）。"""
    meta = parse_plugin_meta(data)
    pid = meta["id"]
    if manager.get(pid) is not None:
        raise PluginInstallError(f"插件 {pid} 已注册（可先删除旧插件再安装）")

    extract_package(data, pid)
    try:
        mod = importlib.import_module(f"plugins.{pid}")
        plugin = getattr(mod, "plugin", None)
        if not isinstance(plugin, Plugin):
            raise PluginInstallError("插件包未定义 plugin 实例")
        _apply_metadata(plugin, PLUGINS_DIR / pid / "plugin.json")
        plugin.source = "user"  # 用户安装的插件一律视为用户自定义（可禁用/删除）
        # 前端 bundle 检测（与 loader 一致）：frontend/frontend.js 存在则前端运行时动态加载 UI
        frontend_js = PLUGINS_DIR / pid / "frontend" / "frontend.js"
        plugin.frontend_path = str(frontend_js) if frontend_js.is_file() else ""
        manager.register(plugin)
        plugin.register(app)
    except PluginInstallError:
        shutil.rmtree(PLUGINS_DIR / pid, ignore_errors=True)
        raise
    except Exception as e:
        shutil.rmtree(PLUGINS_DIR / pid, ignore_errors=True)
        raise PluginInstallError(f"插件注册失败: {e}") from e
    return manager._info(plugin)
