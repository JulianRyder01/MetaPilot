"""插件包校验：plugin.json schema 检查、tags 白名单、id 与路径净化。

与主仓库规范 docs/04-插件开发规范.md §3.2 保持一致（插件商店独立部署，故此处自带一份校验）。
"""
from __future__ import annotations

import io
import json
import re
import zipfile

# 插件 tags 为自由字符串（无白名单），第三方插件可自带任意标签
_ID_RE = re.compile(r"^[a-z][a-z0-9_]*$")

_REQUIRED = ("id", "name", "version", "description", "author")


class ValidationError(Exception):
    """插件包校验失败。"""


def parse_plugin_package(data: bytes) -> dict:
    """从插件包 zip 解析并校验 plugin.json，返回规范化后的元数据。

    兼容两种包结构：
    - 扁平包：zip 根目录直接含 plugin.json（主后端 backend/plugins/<id>/ 打包方式）；
    - 单层目录包：zip 内含 <id>/plugin.json。
    """
    try:
        zf = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile as e:
        raise ValidationError("不是有效的 zip 文件") from e

    names = zf.namelist()
    root_meta = next((n for n in names if n == "plugin.json"), None)
    if root_meta is None:
        # 兼容顶层单目录包：恰好一个 <dir>/plugin.json
        candidates = [n for n in names if n.endswith("plugin.json") and n.count("/") == 1]
        if len(candidates) == 1:
            root_meta = candidates[0]
        else:
            raise ValidationError("包内缺少根目录 plugin.json")

    try:
        meta = json.loads(zf.read(root_meta).decode("utf-8"))
    except Exception as e:
        raise ValidationError("plugin.json 解析失败") from e

    return _normalize_meta(meta)


def _normalize_meta(meta: dict) -> dict:
    if not isinstance(meta, dict):
        raise ValidationError("plugin.json 必须是 JSON 对象")
    for k in _REQUIRED:
        if not meta.get(k):
            raise ValidationError(f"plugin.json 缺少必填字段: {k}")

    pid = meta["id"]
    if not _ID_RE.match(pid):
        raise ValidationError("id 必须为小写字母开头的小写下划线格式")
    if ".." in pid or "/" in pid or "\\" in pid:
        raise ValidationError("id 含非法字符")

    src = meta.get("source", "user")
    if src not in ("core", "official", "user"):
        raise ValidationError("source 必须是 core/official/user")

    tags = meta.get("tags", [])
    if not isinstance(tags, list):
        raise ValidationError("tags 必须是数组")
    # tags 为自由字符串（无白名单），第三方插件可自带任意标签

    # 规范化缺省字段
    meta.setdefault("source", "user")
    meta.setdefault("specVersion", "1.0")
    meta.setdefault("tags", [])
    meta.setdefault("depends_on", [])
    return meta
