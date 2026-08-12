"""插件加载器：扫描 backend/plugins/ 物理目录，加载并注册全部插件。

约定：
- backend/plugins/<plugin_id>/__init__.py 中定义 `plugin = XxxPlugin()` 实例；
- 每个插件目录可带 plugin.json 元数据（id/name/version/description/author/depends_on），
  存在时优先于类属性。
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


def _apply_metadata(plugin: Plugin, meta_path: Path) -> None:
    if not meta_path.exists():
        return
    try:
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
    except Exception:
        return
    for key in ("id", "name", "version", "description", "author", "depends_on"):
        if key in meta and meta[key]:
            setattr(plugin, key, meta[key])


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
            print(f"[plugins] 已加载: {plugin.name} v{plugin.version} (id={plugin.id})")
        except Exception as e:
            print(f"[plugins] 加载 {child.name} 失败: {e}")

    return manager


def get_manager() -> PluginManager:
    return manager
