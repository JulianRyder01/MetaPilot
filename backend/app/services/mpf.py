"""MetaPilot 文件（.mpf）格式核心：序列化、解析、类型分发与解析器注册。

.mpf 是 MetaPilot 的统一文件格式（底层逻辑），头部 type 字段区分内容类型：
- "doc"：库-文档集-文档-小节（课程等文档内容）
- "canvas"：图表（节点 + 连线，与 JSON Canvas 规范 v1.0 对齐）

官方核心解析 doc/canvas 的基础结构；各插件可通过 register_type / register_block_check
扩展解析能力（如课程插件识别题目/交互块）。无法被正确解析的项目标记 unresolved，
前端按「插件警告/报错」设置弹出提示。
"""
from __future__ import annotations

import json
from typing import Callable, Optional

FORMAT = "meta-pilot"
FORMAT_VERSION = 1

# ---------------- 类型注册表 ----------------

# type -> {"title": str, "validate": Callable[[dict], list[str]] 错误列表, "requiredPlugins": list[str]}
_mpf_types: dict[str, dict] = {}
# 块类型 -> 所需插件 id（解析 doc 时检测未解析项）
_block_requirements: dict[str, str] = {}


def register_mpf_type(mpf_type: str, title: str, validate: Callable[[dict], list[str]],
                      required_plugins: Optional[list[str]] = None) -> None:
    """插件注册新的 .mpf 类型：validate 返回错误信息列表（空=合法）。"""
    _mpf_types[mpf_type] = {
        "title": title,
        "validate": validate,
        "requiredPlugins": required_plugins or [],
    }


def register_block_requirement(block_type: str, plugin_id: str) -> None:
    """声明某组件块类型需要某插件才能解析/渲染（用于未解析项检测）。"""
    _block_requirements[block_type] = plugin_id


def list_mpf_types() -> list[dict]:
    return [
        {"type": t, "title": v["title"], "requiredPlugins": v["requiredPlugins"]}
        for t, v in _mpf_types.items()
    ]


def block_plugin_required(block_type: str) -> str:
    return _block_requirements.get(block_type, "")


# ---------------- 序列化 / 解析 ----------------

def serialize_mpf(data: dict) -> str:
    """把内容 dict 序列化为 .mpf 文本。data 需含 type/name 等头部字段。"""
    payload = {
        "format": FORMAT,
        "formatVersion": FORMAT_VERSION,
        "type": data["type"],
        "name": data.get("name", ""),
        "description": data.get("description", ""),
        "createdAt": data.get("createdAt", ""),
        "updatedAt": data.get("updatedAt", ""),
    }
    for key in ("id", "author", "version"):
        if key in data:
            payload[key] = data[key]
    if data["type"] == "doc":
        payload["library"] = data.get("library", {})
        payload["folders"] = data.get("folders", data.get("collections", []))
    elif data["type"] == "canvas":
        payload["canvas"] = data.get("canvas", {"nodes": [], "edges": []})
    return json.dumps(payload, ensure_ascii=False, indent=2)


def parse_mpf(text: str) -> dict:
    """解析 .mpf 文本：返回 {type, meta, content, unresolved, errors}。"""
    try:
        data = json.loads(text)
    except json.JSONDecodeError as e:
        return {"ok": False, "errors": [f"不是有效的 JSON: {e}"], "type": "", "content": None}
    if not isinstance(data, dict):
        return {"ok": False, "errors": [".mpf 必须是 JSON 对象"], "type": "", "content": None}
    if data.get("format") != FORMAT:
        return {"ok": False, "errors": [f"不是 MetaPilot 文件（format 应为 {FORMAT}）"], "type": "", "content": None}
    mpf_type = data.get("type", "")
    if mpf_type not in _mpf_types:
        return {"ok": False, "errors": [f"未知的 .mpf 类型: {mpf_type}，需要安装提供该类型的插件"], "type": mpf_type, "content": None}

    registry = _mpf_types[mpf_type]
    errors = registry["validate"](data)
    unresolved = _find_unresolved(data)
    meta = {
        "type": mpf_type,
        "name": data.get("name", ""),
        "description": data.get("description", ""),
        "author": data.get("author", ""),
        "version": data.get("version", ""),
        "formatVersion": data.get("formatVersion", FORMAT_VERSION),
    }
    if errors:
        return {"ok": False, "errors": errors, "type": mpf_type, "content": None, "meta": meta, "unresolved": unresolved}
    if mpf_type == "doc":
        content = {"library": data.get("library", {}),
                   "folders": data.get("folders", data.get("collections", []))}
    else:
        content = data.get("canvas", {"nodes": [], "edges": []})
    return {"ok": True, "type": mpf_type, "meta": meta, "content": content, "unresolved": unresolved}


def _find_unresolved(data: dict) -> list[dict]:
    """扫描 doc 中的块，找出需要插件但插件可能不可用的项目（由调用方结合插件状态过滤）。"""
    if data.get("type") != "doc":
        return []
    found = []
    for col in data.get("folders", data.get("collections", [])):
        for doc in col.get("documents", []):
            for sec in doc.get("sections", []):
                for b in sec.get("blocks", []):
                    plugin = block_plugin_required(b.get("type", ""))
                    if plugin:
                        found.append({
                            "blockType": b.get("type"),
                            "requiredPlugin": plugin,
                            "sectionName": sec.get("name", ""),
                        })
    return found


# ---------------- 官方核心：doc / canvas 基础校验 ----------------

def _validate_doc(data: dict) -> list[str]:
    errors = []
    folders = data.get("folders", data.get("collections"))
    if not isinstance(folders, list):
        return ["doc 类型缺少 folders 数组"]
    for i, col in enumerate(folders):
        if not isinstance(col, dict) or not col.get("name"):
            errors.append(f"folders[{i}] 缺少 name")
        for doc in col.get("documents", []):
            if not doc.get("name"):
                errors.append(f"folders[{i}] 存在未命名的文档")
            for sec in doc.get("sections", []):
                if not sec.get("name"):
                    errors.append(f"folders[{i}] 存在未命名的小节")
    return errors


def _validate_canvas(data: dict) -> list[str]:
    canvas = data.get("canvas", {})
    errors = []
    for key in ("nodes", "edges"):
        if not isinstance(canvas.get(key), list):
            errors.append(f"canvas 缺少 {key} 数组")
    for i, node in enumerate(canvas.get("nodes", [])):
        for field in ("id", "type", "x", "y", "width", "height"):
            if field not in node:
                errors.append(f"canvas.nodes[{i}] 缺少 {field}")
                break
    return errors


def register_core_mpf_types() -> None:
    register_mpf_type("doc", "文档/课程", _validate_doc)
    register_mpf_type("canvas", "图表", _validate_canvas)
    # 各插件负责的组件块类型（如课程的单选/填空/交互块）由插件在 plugin.json 声明，
    # 加载器（app.plugins.loader）收集进本注册表，核心不再写死插件映射。
