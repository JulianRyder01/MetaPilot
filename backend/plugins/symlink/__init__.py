"""软链接插件（官方）：挂载本机任意目录，作为文件系统一样浏览与读写。"""
from __future__ import annotations

from fastapi import FastAPI

from app.config import DATA_DIR
from app.plugins.base import Plugin
from .service import SymlinkService


class SymlinkPlugin(Plugin):
    id = "symlink"

    def register(self, app: FastAPI) -> None:
        from .routes import router

        app.state.symlink = SymlinkService(DATA_DIR)
        app.include_router(router)


plugin = SymlinkPlugin()
