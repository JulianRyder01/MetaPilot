"""软链接插件（官方）：挂载本机任意目录，作为文件系统一样浏览与读写。"""
from __future__ import annotations

from fastapi import FastAPI

from app.config import DATA_DIR
from app.plugins.base import Plugin, manager
from .service import SymlinkService


class SymlinkPlugin(Plugin):
    id = "symlink"

    def register(self, app: FastAPI) -> None:
        from .routes import router

        service = SymlinkService(DATA_DIR)
        app.state.symlink = service
        # 能力服务注册：其它插件经 capability 注册表取挂载源服务，不写死插件 id / app.state
        # 能力元数据由 plugin.json capabilities 声明（loader 注册），此处仅绑定服务对象，避免覆盖元数据
        manager.register_service("symlink.mounts", service)
        app.include_router(router)


plugin = SymlinkPlugin()
