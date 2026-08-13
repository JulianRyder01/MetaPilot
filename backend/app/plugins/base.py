"""插件机制：基类、注册表与启用状态管理。

- 插件是 backend/plugins/<plugin_id>/ 下的独立 Python 包（物理目录，含 plugin.json 元数据）。
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

if TYPE_CHECKING:
    from fastapi import FastAPI


class Plugin:
    id: str = ""
    name: str = ""
    version: str = "1.0.0"
    description: str = ""
    author: str = ""
    # 来源分类：core（MetaPilot 本身，不可禁用/删除）| official（官方插件，可禁用不可删除）| user（用户自定义，可删除/禁用）
    source: str = "user"
    # 依赖的其它插件 id
    depends_on: list[str] = []

    def register(self, app: "FastAPI") -> None:
        raise NotImplementedError


class PluginManager:
    def __init__(self, data_dir: str | Path):
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.state_path = self.data_dir / "plugins.json"
        self._lock = threading.Lock()
        self._registry: dict[str, Plugin] = {}
        self._state: dict[str, bool] = self._load_state()

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

    def list(self) -> list[dict]:
        """插件清单（含启用状态、来源分类与依赖信息），首位为官方核心。"""
        out = [self._core_info()]
        for p in self._registry.values():
            out.append(self._info(p))
        return out

    @staticmethod
    def _core_info() -> dict:
        return {
            "id": "core",
            "name": "MetaPilot 文档库",
            "version": "1.0.0",
            "description": "MetaPilot 本身：库-文档集-文档-小节 的浏览与 Markdown 阅读、笔记导入、插件管理。官方核心，不允许禁用或删除。",
            "author": "MetaPilot",
            "source": "core",
            "enabled": True,
            "locked": True,
            "removable": False,
            "dependsOn": [],
            "missingDependencies": [],
        }

    def _info(self, p: Plugin) -> dict:
        deps = [d for d in p.depends_on if d in self._registry]
        enabled = self.is_enabled(p.id)
        missing_deps = [d for d in p.depends_on if d not in self._registry or not self.is_enabled(d)]
        return {
            "id": p.id,
            "name": p.name,
            "version": p.version,
            "description": p.description,
            "author": p.author,
            "source": p.source,
            "enabled": enabled,
            "locked": p.source == "core",
            "removable": p.source == "user",
            "dependsOn": deps,
            "missingDependencies": missing_deps,
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
            target = PLUGINS_DIR / plugin_id
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
