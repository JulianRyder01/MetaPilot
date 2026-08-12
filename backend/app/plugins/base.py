"""插件机制：基类与注册表。

插件 = 一个 Python 模块，继承 Plugin 并在 register() 中挂载路由 / 初始化服务。
插件清单经 GET /api/plugins 暴露给前端。
"""
from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from fastapi import FastAPI


class Plugin:
    id: str = ""
    name: str = ""
    version: str = "1.0.0"
    description: str = ""

    def register(self, app: "FastAPI") -> None:
        raise NotImplementedError

    def unregister(self, app: "FastAPI") -> None:
        pass


_registry: dict[str, Plugin] = {}


def register_plugin(plugin: Plugin) -> None:
    _registry[plugin.id] = plugin


def list_plugins() -> list[dict]:
    return [
        {"id": p.id, "name": p.name, "version": p.version,
         "description": p.description, "enabled": True}
        for p in _registry.values()
    ]
