"""插件机制：基类、注册表与启用状态管理。

- 插件是 PLUGINS_DIR/<plugin_id>/ 下的独立 Python 包（物理目录，含 plugin.json 元数据；
- 加载器扫描该目录，将每个插件的 `plugin` 实例注册到 PluginManager。
- 启用/禁用状态持久化在 backend/data/plugins.json，运行时切换无需重启。
- 插件路由始终挂载，但通过 `requires_plugin` 依赖在禁用时返回 503 + 提示。
"""
from __future__ import annotations

import json
import threading
from pathlib import Path
from typing import TYPE_CHECKING, Optional

from fastapi import HTTPException, Request

from ..version import VERSION
from .core_tutorials import CORE_TUTORIALS

if TYPE_CHECKING:
    from fastapi import FastAPI


# 插件清单排序：用户自定义 → 官方插件 → 官方核心
_SOURCE_ORDER = {"user": 0, "official": 1, "core": 2}

# 官方核心集合类型（kind）元数据：kind → {labelKey, icon, openRoute, unitLabelKey}
# 插件的 kind（如 course）由插件在 plugin.json collection_kinds 声明，核心不写死
CORE_COLLECTION_KINDS: dict[str, dict] = {
    "note": {
        "labelKey": "core.library.kindNote", "icon": "FileText",
        "openRoute": "/edit/{id}", "unitLabelKey": "core.library.unitDoc",
    },
    "kb": {
        "labelKey": "core.library.kindKb", "icon": "BookMarked",
        "openRoute": "/edit/{id}", "unitLabelKey": "core.library.unitDoc",
    },
    "canvas": {
        "labelKey": "core.library.kindCanvas", "icon": "LayoutGrid",
        "openRoute": "/canvas/{id}", "unitLabelKey": "core.library.unitCanvas",
    },
}


class Plugin:
    # 元数据唯一来源是 plugin.json（docs/04-插件开发规范.md §3）；
    # 以下类属性仅作为旧格式插件（无 plugin.json 或字段缺失）的向后兼容回退。
    id: str = ""
    name: str = ""
    version: str = "1.0.0"
    description: str = ""
    author: str = ""
    # 本插件遵循的规范版本（plugin.json 的 specVersion），缺省视为 "1.0"
    spec_version: str = "1.0"
    # 来源分类：core（MetaPilot 本身，不可禁用/删除）| official（官方插件，可禁用不可删除）| user（用户自定义，可删除/禁用）
    source: str = "user"
    # 依赖的其它插件 id（强依赖：缺失/未启用时不允许启用本插件）
    depends_on: list[str] = []
    # 功能标签（自由字符串，可多个，用于商店/插件页筛选）
    tags: list[str] = []
    # 更新历史（schema v1.1 起可选）：[{version, date, summary}]，时间倒序（最新在前）
    changelog: list[dict] = []
    # 本插件提供的能力（schema v1.2 起）：{cap_id: {描述元数据}}，供其它插件能力检测而非写死插件 id
    capabilities: dict[str, dict] = {}
    # 本插件需要的能力（可选，缺失不阻止启用，仅对应功能不可用）：[cap_id]
    requires: list[str] = []
    # 本插件负责解析/渲染的组件块类型（schema v1.2 起）：核心据此反查 requiredPlugin，不再写死映射
    content_types: list[str] = []
    # 本插件负责的集合类型（kind → 元数据 {labelKey, icon, openRoute, unitLabelKey}）
    # （schema v1.3 起）：kind→打开路由等由插件声明，核心不写死插件 kind 的映射
    collection_kinds: dict[str, dict] = {}
    # 本插件自带的使用教程（schema v1.7 起）：[{id, title, summary?, content(markdown)}]，
    # 核心「使用教程」页聚合各插件的 tutorials 统一展示，插件声明即生效，核心不写死任何插件内容
    tutorials: list[dict] = []
    # 前端展示元数据（schema v1.2 起）：功能列表 / 图标名（lucide），缺失时前端回退通用展示
    features: list[str] = []
    icon: str = ""
    # 运行时检测：插件包内 frontend/frontend.js 的物理路径（有则前端可动态加载其 UI bundle）
    frontend_path: str = ""

    def register(self, app: "FastAPI") -> None:
        raise NotImplementedError

    def declare_capability(self, cap_id: str, meta: dict | None = None) -> None:
        """声明本插件提供的能力（可在 register 中调用），供其它插件能力检测。"""
        manager.register_capability(self.id, cap_id, meta or {})


class PluginManager:
    def __init__(self, data_dir: str | Path):
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.state_path = self.data_dir / "plugins.json"
        self._lock = threading.Lock()
        self._registry: dict[str, Plugin] = {}
        self._state: dict[str, bool] = self._load_state()
        # 能力注册表：cap_id → {provider: 插件 id, **提供者元数据}
        self._capabilities: dict[str, dict] = {}
        # 能力服务注册表：cap_id → 服务对象（插件 register 时注入，供其它插件经能力取用，不写死 app.state）
        self._services: dict[str, object] = {}

    def _load_state(self) -> dict[str, bool]:
        if not self.state_path.exists():
            return {}
        try:
            return json.loads(self.state_path.read_text(encoding="utf-8"))
        except Exception:
            return {}

    def configure(self, data_dir: str | Path) -> None:
        """应用启动时设置数据目录并重载启用状态。"""
        self.data_dir = Path(data_dir)
        self.state_path = self.data_dir / "plugins.json"
        self._state = self._load_state()

    def _save_state(self) -> None:
        self.state_path.write_text(
            json.dumps(self._state, ensure_ascii=False, indent=2), encoding="utf-8"
        )

    # ---- 注册 ----

    def register(self, plugin: Plugin) -> None:
        with self._lock:
            self._registry[plugin.id] = plugin

    def get(self, plugin_id: str) -> Optional[Plugin]:
        return self._registry.get(plugin_id)

    # ---- 能力注册表（capability）：插件间互操作不写死插件 id ----

    def register_capability(self, provider_id: str, cap_id: str, meta: dict | None = None) -> None:
        """插件声明自己提供的能力（cap_id → 元数据），供其它插件能力检测。"""
        with self._lock:
            self._capabilities[cap_id] = {"provider": provider_id, **(meta or {})}

    def capability(self, cap_id: str) -> Optional[dict]:
        """能力元数据（含 provider 插件 id）；未注册返回 None。"""
        return self._capabilities.get(cap_id)

    def capability_available(self, cap_id: str) -> bool:
        """能力可用 = 已注册且提供方插件处于启用状态。"""
        cap = self._capabilities.get(cap_id)
        return bool(cap and self.is_enabled(cap["provider"]))

    def provider_for_capability(self, cap_id: str) -> str:
        """提供某能力的插件 id；未注册返回空串。"""
        cap = self._capabilities.get(cap_id)
        return cap["provider"] if cap else ""

    def register_service(self, cap_id: str, service: object) -> None:
        """插件 register 时把能力对应的服务对象注册进能力注册表（供其它插件经能力取用）。"""
        with self._lock:
            self._services[cap_id] = service

    def service_for_capability(self, cap_id: str):
        """取某能力的服务对象（能力不可用/未注册服务返回 None）。"""
        if not self.capability_available(cap_id):
            return None
        return self._services.get(cap_id)

    def plugin_for_block_type(self, block_type: str) -> str:
        """负责解析某组件块类型的插件 id（从插件声明的 content_types 反查，不写死映射）。"""
        with self._lock:
            for p in self._registry.values():
                if block_type in p.content_types:
                    return p.id
        return ""

    def collection_kinds(self) -> dict:
        """全部集合类型（kind）元数据：官方核心类型 + 插件声明的类型（插件优先同名覆盖）。"""
        kinds = {k: dict(v) for k, v in CORE_COLLECTION_KINDS.items()}
        with self._lock:
            for p in self._registry.values():
                for k, meta in p.collection_kinds.items():
                    kinds[k] = {**meta, "pluginId": p.id}
        return kinds

    def list(self) -> list[dict]:
        """插件清单（含启用状态、来源分类、tags 与依赖信息）。

        顺序：用户自定义 → 官方插件 → 官方核心（官方核心放最后）。
        """
        plugins = sorted(
            self._registry.values(),
            key=lambda p: (_SOURCE_ORDER.get(p.source, 9), p.name or p.id),
        )
        out = [self._info(p) for p in plugins]
        out.append(self._core_info())
        return out

    @staticmethod
    def _core_info() -> dict:
        return {
            "id": "core",
            "name": "MetaPilot 文档库",
            "version": VERSION,
            "specVersion": "1.0",
            "description": "MetaPilot 本身：库-文档集-文档-小节 的浏览与 Markdown 阅读、笔记导入、插件管理，并提供统一 AI 网关（API 配置/中转/用量统计）与本地模型管理。官方核心，不允许禁用或删除。",
            "author": "MetaPilot",
            "source": "core",
            "tags": [],
            "enabled": True,
            "locked": True,
            "removable": False,
            "dependsOn": [],
            "missingDependencies": [],
            "capabilities": ["core.doc", "core.canvas"],
            "requires": [],
            "missingCapabilities": [],
            "contentTypes": ["markdown"],
            "features": ["库-文档集-文档-小节浏览与阅读", "Markdown / Obsidian 笔记导入", "插件管理与插件商店", "统一 AI 网关与用量统计", "本地模型管理"],
            "icon": "BookOpen",
            "tutorials": CORE_TUTORIALS,
            "changelog": [
                {"version": VERSION, "date": "", "summary": "版本号统一为单一来源（backend/app/version.py，= 项目版本 = 桌面打包版本）；支持桌面端 Electron 打包分发（后端/前端/插件随应用内置，数据目录与 .env 迁移至用户数据目录，前端静态资源由后端同源托管）"},
                {"version": "1.1.2", "date": "", "summary": "核心文档能力独立于课程插件：库页可新建文档（笔记文档集）；文档阅读（/learn）与编辑（/edit）改为官方核心路由，禁用课程插件后文档仍可正常阅读/编辑（课程补丁能力才依赖插件并提示）；文档集类型元数据 note/kb 打开路由指向核心编辑页；核心创建集合默认 kind 为 note（不默认课程）"},
                {"version": "1.1.1", "date": "", "summary": "统一 AI 网关：设置页配置 openai/anthropic 兼容 API 入口（key/地址/模型/价格，全部存 .env），插件经 MetaPilot 中转调用（拿不到密钥）；统计页新增 AI 用量（调用次数/token/成本，按模型分组）；内置本地模型（Qwen3-Embedding 0.6B/4B、Qwen3-4B、Qwen3-Reranker）一键下载与启动"},
                {"version": "1.1.0", "date": "", "summary": "内置 i18n：界面支持简体中文/繁体中文/English 三语（useT/translate + 域拆分词典），顶栏与设置页可随时切换；插件开发规范升级 1.2.0（新增 §12 i18n 约定）"},
                {"version": "1.0.1", "date": "", "summary": "统一弹窗组件库 DialogProvider + useDialogs（confirm/prompt/select），全应用零原生弹窗；.mpf 解析支持 doc/canvas 类型与未解析项检测"},
                {"version": "1.0.0", "date": "", "summary": "MetaPilot 首个正式版本：库-文档集-文档-小节浏览与 Markdown 阅读、笔记导入、插件机制与插件管理、基础统计（访问/热力图/停留/字数）"},
            ],
        }

    def _info(self, p: Plugin) -> dict:
        deps = [d for d in p.depends_on if d in self._registry]
        enabled = self.is_enabled(p.id)
        missing_deps = [d for d in p.depends_on if d not in self._registry or not self.is_enabled(d)]
        missing_caps = [c for c in p.requires if not self.capability_available(c)]
        return {
            "id": p.id,
            "name": p.name,
            "version": p.version,
            "specVersion": p.spec_version,
            "description": p.description,
            "author": p.author,
            "source": p.source,
            "tags": p.tags,
            "enabled": enabled,
            "locked": p.source == "core",
            "removable": p.source == "user",
            "dependsOn": deps,
            "missingDependencies": missing_deps,
            "capabilities": list(p.capabilities.keys()),
            "requires": list(p.requires),
            "missingCapabilities": missing_caps,
            "contentTypes": list(p.content_types),
            "features": list(p.features),
            "icon": p.icon,
            "tutorials": p.tutorials or [],
            "hasFrontend": bool(p.frontend_path),
            "frontendUrl": f"/api/plugins/{p.id}/frontend.js" if p.frontend_path else "",
            "changelog": p.changelog or [],
        }

    # ---- 启用状态 ----

    def is_enabled(self, plugin_id: str) -> bool:
        return self._state.get(plugin_id, True)  # 默认启用

    def set_enabled(self, plugin_id: str, enabled: bool) -> dict:
        with self._lock:
            p = self._registry.get(plugin_id)
            if p is None:
                raise KeyError(f"插件不存在: {plugin_id}")
            if p.source == "core":
                raise ValueError("官方核心（MetaPilot 本身）不允许禁用")
            if enabled:
                # 启用前检查依赖是否已启用
                missing = [d for d in p.depends_on if d in self._registry and not self.is_enabled(d)]
                if missing:
                    names = [self._registry[m].name for m in missing]
                    raise ValueError(f"请先启用依赖插件: {'、'.join(names)}")
            self._state[plugin_id] = enabled
            self._save_state()
            return self._info(p)

    def enable(self, plugin_id: str) -> dict:
        return self.set_enabled(plugin_id, True)

    def disable(self, plugin_id: str) -> dict:
        return self.set_enabled(plugin_id, False)

    def remove(self, plugin_id: str) -> None:
        """删除用户自定义插件：移除注册并从物理目录删除。"""
        with self._lock:
            p = self._registry.get(plugin_id)
            if p is None:
                raise KeyError(f"插件不存在: {plugin_id}")
            if p.source != "user":
                raise ValueError("仅用户自定义插件可以删除")
            self._registry.pop(plugin_id, None)
            self._state.pop(plugin_id, None)
            self._save_state()
            from .loader import PLUGINS_DIR
            # 路径净化：仅允许删除 PLUGINS_DIR 下的直接子目录（防 ../ 与任意路径删除）
            plugins_root = PLUGINS_DIR.resolve()
            target = (plugins_root / plugin_id).resolve()
            if not target.is_relative_to(plugins_root) or target == plugins_root:
                raise ValueError("非法插件路径，已拒绝删除")
            if target.exists():
                import shutil
                shutil.rmtree(target, ignore_errors=True)


# 全局插件管理器（由加载器在应用启动时填充）
manager = PluginManager(Path.cwd())


def requires_plugin(plugin_id: str):
    """FastAPI 依赖：插件被禁用时返回 503 与启用提示。"""

    def _check(request: Request):
        p = manager.get(plugin_id)
        if p is None:
            raise HTTPException(status_code=404, detail=f"插件不存在: {plugin_id}")
        if not manager.is_enabled(plugin_id):
            raise HTTPException(
                status_code=503,
                detail=f"需要启用「{p.name}」插件才可使用此功能，请在插件管理页启用（/plugins）",
            )
        return p

    return _check
