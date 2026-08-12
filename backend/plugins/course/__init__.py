"""课程插件：课程包制作与导入/导出、动态交互块资产托管。"""
from __future__ import annotations

from fastapi import FastAPI

from app.plugins.base import Plugin


class CoursePlugin(Plugin):
    id = "course"
    name = "课程"
    version = "1.0.0"
    description = "课程包制作与导入/导出、Markdown 笔记导入"
    author = "MetaPilot"

    def register(self, app: FastAPI) -> None:
        from .routes import router

        app.include_router(router)


plugin = CoursePlugin()
