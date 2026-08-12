"""课程插件：课程包的制作、导入/导出、交互块资产托管。"""
from __future__ import annotations

from fastapi import FastAPI

from ..base import Plugin


class CoursePlugin(Plugin):
    id = "course"
    name = "课程"
    version = "1.0.0"
    description = "课程包制作与导入/导出、动态交互块资产托管"

    def register(self, app: FastAPI) -> None:
        from ...api import plugins as plugins_api

        app.include_router(plugins_api.router)


plugin = CoursePlugin()
