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

# 插件物理目录（多根）：
# - 源码开发模式扫描顺序 = ①官方核心（core/backend/plugins，随 main 管理）→ ②官方扩展仓库
#   （backend-plugins-repo）→ ③自定义插件宿主目录（plugins/，每个自定义插件一个独立 git 仓库）；
# - 桌面打包由 Electron 通过 METAPILOT_PLUGINS_DIR 传入（打包后用户数据目录，可写，支持安装/删除插件），
#   支持平台路径分隔符（Windows `;` / POSIX `:`）分隔多路径；无则回退。
# - PLUGINS_DIR 为主根（可写，安装/删除用户插件的目标）；PLUGINS_DIRS 为全部扫描根。
_env_plugins = os.environ.get("METAPILOT_PLUGINS_DIR", "").strip()
_here = Path(__file__).resolve()
if _env_plugins:
    PLUGINS_DIRS = [Path(p) for p in _env_plugins.split(os.pathsep) if p.strip()]
    PLUGINS_DIR = PLUGINS_DIRS[0]
elif getattr(sys, "frozen", False):
    PLUGINS_DIR = Path(os.environ.get("METAPILOT_ROOT") or Path(sys.executable).resolve().parent) / "plugins"
    PLUGINS_DIRS = [PLUGINS_DIR]
else:
    # 源码开发模式多根：存在即加入扫描；安装主根优先自定义宿主 plugins/
    _core_official = _here.parents[2] / "plugins"            # core/backend/plugins（官方核心）
    _ext_repo = _here.parents[4] / "backend-plugins-repo"    # 官方扩展仓库
    _custom_host = _here.parents[4] / "plugins"              # 自定义插件宿主（每插件一仓库）
    _roots: list[Path] = []
    for _p in (_core_official, _ext_repo, _custom_host):
        if _p.exists() and _p not in _roots:
            _roots.append(_p)
    PLUGINS_DIRS = _roots
    # 主根：自定义宿主优先（用户安装/删除落这里），否则第一个存在的根
    PLUGINS_DIR = _custom_host if _custom_host in _roots else (PLUGINS_DIRS[0] if PLUGINS_DIRS else _custom_host)

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
    """扫描全部插件根（PLUGINS_DIRS）注册所有插件，返回配置好的管理器。

    多根扫描顺序 = 官方核心（core/backend/plugins）→ 官方扩展（backend-plugins-repo）→
    自定义插件宿主（plugins/，每插件一独立 git 仓库）；不同根的插件同名时先注册者优先（跳过后续）。
    """
    manager.configure(data_dir)

    if not PLUGINS_DIRS:
        return manager

    # 确保 plugins 顶层包可导入：把全部插件根合并为 plugins 包的搜索路径
    # （官方核心/官方扩展/自定义宿主目录名均非 plugins，sys.modules 别名挂载后
    #  importlib.import_module("plugins.<id>") 无痕命中任一根；插件内部仅用相对导入与
    #  app.* 前缀，不受目录名影响；重复挂载无副作用）。
    if "plugins" not in sys.modules:
        _first_init = next((p / "__init__.py" for p in PLUGINS_DIRS if (p / "__init__.py").exists()), None)
        if _first_init is not None:
            import importlib.util as _ilu

            _spec = _ilu.spec_from_file_location(
                "plugins", str(_first_init),
                submodule_search_locations=[str(p) for p in PLUGINS_DIRS],
            )
            _mod = _ilu.module_from_spec(_spec)
            sys.modules["plugins"] = _mod
            if _spec.loader:
                _spec.loader.exec_module(_mod)

    for root in PLUGINS_DIRS:
        if not root.exists():
            continue
        for child in sorted(root.iterdir()):
            if not child.is_dir():
                continue
            init_file = child / "__init__.py"
            if not init_file.exists():
                continue
            if manager.get(child.name) is not None:
                print(f"[plugins] 跳过 {root.name}/{child.name}：已注册（多根同名，先注册者优先）")
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
