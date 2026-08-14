"""插件加载器：扫描 backend/plugins/ 物理目录，加载并注册全部插件。

约定（见 docs/04-插件开发规范.md）：
- 元数据唯一来源是 plugin.json（schema v1，含 specVersion）；字段缺失时回退 Plugin 类默认值；
- backend/plugins/<plugin_id>/__init__.py 中定义 `plugin = XxxPlugin()` 实例（类只写 id 与 register）；
- specVersion 高于加载器支持版本时打印警告但仍尝试加载（宽松向后兼容）。
"""
from __future__ import annotations

import importlib
import json
from pathlib import Path
from typing import TYPE_CHECKING

from .base import Plugin, PluginManager, manager

if TYPE_CHECKING:
    pass

PLUGINS_DIR = Path(__file__).resolve().parents[2] / "plugins"  # backend/plugins

# 加载器支持的规范版本（docs/04 §0）。高于此版本的插件警告后仍尝试加载（宽松兼容）。
SUPPORTED_SPEC_VERSION = "1.0"

# plugin.json 字段 → Plugin 属性 映射（schema v1）
_META_FIELDS = (
    ("specVersion", "spec_version"),
    ("id", "id"),
    ("name", "name"),
    ("version", "version"),
    ("description", "description"),
    ("author", "author"),
    ("depends_on", "depends_on"),
    ("source", "source"),
    ("tags", "tags"),
)


def _apply_metadata(plugin: Plugin, meta_path: Path) -> None:
    """以 plugin.json 为唯一元数据源覆盖类默认值；缺失/解析失败时回退类属性（旧格式兼容）。"""
    meta: dict = {}
    if meta_path.exists():
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
        except Exception as e:
            print(f"[plugins] {plugin.id or meta_path.parent.name}: plugin.json 解析失败: {e}（回退类属性）")
    for key, attr in _META_FIELDS:
        if key in meta and meta[key]:
            setattr(plugin, attr, meta[key])
    # specVersion 兼容检查：高于加载器支持版本时仅警告，不拒绝加载
    spec = getattr(plugin, "spec_version", "1.0") or "1.0"
    if spec != SUPPORTED_SPEC_VERSION:
        print(
            f"[plugins] 警告: {plugin.id} 声明规范版本 {spec}，"
            f"加载器支持 {SUPPORTED_SPEC_VERSION}，按宽松模式尝试加载"
        )


def load_plugins(data_dir: str | Path) -> PluginManager:
    """扫描 plugins/ 目录注册所有插件，返回配置好的管理器。"""
    manager.configure(data_dir)

    if not PLUGINS_DIR.exists():
        return manager

    for child in sorted(PLUGINS_DIR.iterdir()):
        if not child.is_dir():
            continue
        init_file = child / "__init__.py"
        if not init_file.exists():
            continue
        try:
            mod = importlib.import_module(f"plugins.{child.name}")
            plugin = getattr(mod, "plugin", None)
            if not isinstance(plugin, Plugin):
                print(f"[plugins] 跳过 {child.name}：未定义 plugin 实例")
                continue
            _apply_metadata(plugin, child / "plugin.json")
            manager.register(plugin)
            print(f"[plugins] 已加载: {plugin.name} v{plugin.version} (id={plugin.id}, spec={plugin.spec_version})")
        except Exception as e:
            print(f"[plugins] 加载 {child.name} 失败: {e}")

    return manager


def get_manager() -> PluginManager:
    return manager
