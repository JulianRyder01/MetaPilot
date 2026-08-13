"""软链接插件（官方）：挂载本机任意目录，作为文件系统一样浏览与读写。"""
from __future__ import annotations

from fastapi import FastAPI

from app.config import DATA_DIR
from app.plugins.base import Plugin
from .service import SymlinkService


class SymlinkPlugin(Plugin):
    id = "symlink"
    name = "软链接"
    version = "1.0.0"
    description = "挂载本机任意目录，像操作系统文件系统一样浏览与读写（权限限制在挂载根内）"
    author = "MetaPilot"
    source = "official"

    def register(self, app: FastAPI) -> None:
        from .routes import router

        app.state.symlink = SymlinkService(DATA_DIR)
        app.include_router(router)


plugin = SymlinkPlugin()
