"""课程插件：课程包制作与导入/导出、学习（进度/统计/AI 判题）、动态交互块资产托管。"""
from __future__ import annotations

from fastapi import FastAPI

from app.config import DATA_DIR
from app.plugins.base import Plugin
from app.storage.progress import ProgressStore
from app.storage.stats import StatsStore


class CoursePlugin(Plugin):
    id = "course"
    name = "课程"
    version = "1.0.0"
    description = "课程包制作与导入/导出、章节知识点学习（进度/时长统计/AI 判题）、动态交互块渲染"
    author = "MetaPilot"

    def register(self, app: FastAPI) -> None:
        from .routes import router as plugins_router
        from .routes_learning import ai_router, assets_router, progress_router, stats_router

        app.state.progress = ProgressStore(DATA_DIR)
        app.state.stats = StatsStore(DATA_DIR)
        app.include_router(plugins_router)
        app.include_router(progress_router)
        app.include_router(stats_router)
        app.include_router(ai_router)
        app.include_router(assets_router)


plugin = CoursePlugin()
