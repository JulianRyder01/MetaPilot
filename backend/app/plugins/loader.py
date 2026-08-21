"""插件加载器：扫描 backend/plugins/ 物理目录，加载并注册全部插件。

约定（见 docs/04-插件开发规范.md）：
- 元数据唯一来源是 plugin.json（schema v1，含 specVersion）；字段缺失时回退 Plugin 类默认值；
- PLUGINS_DIR/<plugin_id>/__init__.py 中定义 `plugin = XxxPlugin()` 实例（类只写 id 与 register）；
- specVersion 高于加载器支持版本时打印警告但仍尝试加载（宽松向后兼容）。
"""
from __future__ import annotations

import importlib
import json
import os
import sys
from pathlib import Path
from typing import TYPE_CHECKING

from .base import Plugin, PluginManager, manager
from ..services.mpf import register_block_requirement

if TYPE_CHECKING:
    pass

# 插件物理目录：第三方插件独立仓库 backend-plugins-repo（源码开发模式默认，与 core 解耦）；
# 亦兼容旧布局 core/backend/plugins（存在时优先，向后兼容）；桌面打包由 Electron 通过
# METAPILOT_PLUGINS_DIR 传入（打包后用户数据目录，可写，支持安装/删除插件），无则回退。
_env_plugins = os.environ.get("METAPILOT_PLUGINS_DIR", "").strip()
if _env_plugins:
    PLUGINS_DIR = Path(_env_plugins)
elif getattr(sys, "frozen", False):
    PLUGINS_DIR = Path(os.environ.get("METAPILOT_ROOT") or Path(sys.executable).resolve().parent) / "plugins"
else:
    # 源码开发模式：①core/backend/plugins（旧布局，存在即用，向后兼容）；
    # ②工作区平级 backend-plugins-repo（第三方插件独立 git 仓库：Aug26MetaPilot/core 与
    #   Aug26MetaPilot/backend-plugins-repo 平级摆放时自动探测命中）。
    _here = Path(__file__).resolve()
    _legacy = _here.parents[2] / "plugins"                 # core/backend/plugins
    _repo = _here.parents[4] / "backend-plugins-repo"      # ../backend-plugins-repo
    PLUGINS_DIR = _legacy if _legacy.exists() else (_repo if _repo.exists() else _legacy)

# 加载器支持的规范版本（docs/04 §0）。高于此版本的插件警告后仍尝试加载（宽松兼容）。
SUPPORTED_SPEC_VERSION = "1.1"

# plugin.json 字段 → Plugin 属性 映射（schema v1.2）
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
    # 更新历史（schema v1.1 起可选）：[{version, date, summary}]，时间倒序（最新在前）
    ("changelog", "changelog"),
    # 能力/扩展点与前端展示元数据（schema v1.2 起可选）
    ("capabilities", "capabilities"),
    ("requires", "requires"),
    ("content_types", "content_types"),
    ("features", "features"),
    ("icon", "icon"),
    # 插件自带的使用教程（schema v1.7 起可选）：[{id, title, summary?, content}]，
    # 核心「使用教程」页聚合展示，插件声明即生效
    ("tutorials", "tutorials"),
    # 插件负责的集合类型（schema v1.3 起可选）：kind → {labelKey, icon, openRoute, unitLabelKey}
    ("collection_kinds", "collection_kinds"),
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

    # 确保 plugins 顶层包可导入：
    # - 旧布局（core/backend/plugins）：把 parent 加入 sys.path 后 import 命中真实 plugins 目录；
    # - 新布局（独立仓库 backend-plugins-repo，目录名非 plugins）：把 PLUGINS_DIR 挂载为
    #   `plugins` 顶层包（sys.modules 别名），importlib.import_module("plugins.<id>") 无痕命中，
    #   插件内部仅用相对导入与 app.* 前缀，不受目录名影响；重复挂载无副作用。
    parent = str(PLUGINS_DIR.parent)
    if parent not in sys.path:
        sys.path.insert(0, parent)
    if "plugins" not in sys.modules and (PLUGINS_DIR / "__init__.py").exists():
        import importlib.util as _ilu

        _spec = _ilu.spec_from_file_location(
            "plugins", str(PLUGINS_DIR / "__init__.py"),
            submodule_search_locations=[str(PLUGINS_DIR)],
        )
        _mod = _ilu.module_from_spec(_spec)
        sys.modules["plugins"] = _mod
        if _spec.loader:
            _spec.loader.exec_module(_mod)

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
            # 前端 bundle（frontend/frontend.js）存在性检测：有则前端运行时动态加载其 UI
            frontend_js = child / "frontend" / "frontend.js"
            plugin.frontend_path = str(frontend_js) if frontend_js.is_file() else ""
            manager.register(plugin)
            # 插件声明的组件块类型 → 核心 .mpf 解析注册表（不再由核心写死映射）
            for bt in plugin.content_types:
                register_block_requirement(bt, plugin.id)
            # 插件声明的能力（plugin.json capabilities 字段）注册进能力注册表
            for cap_id, cap_meta in plugin.capabilities.items():
                manager.register_capability(plugin.id, cap_id, cap_meta or {})
            print(f"[plugins] 已加载: {plugin.name} v{plugin.version} (id={plugin.id}, spec={plugin.spec_version})")
        except Exception as e:
            print(f"[plugins] 加载 {child.name} 失败: {e}")

    return manager


def get_manager() -> PluginManager:
    return manager
