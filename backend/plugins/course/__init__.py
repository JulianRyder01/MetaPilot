"""课程插件：课程包制作与导入/导出、学习（进度/统计/AI 判题）、动态交互块资产托管。"""
from __future__ import annotations

from fastapi import FastAPI

from app.config import DATA_DIR
from app.plugins.base import Plugin
from app.storage.progress import ProgressStore
from app.storage.stats import StatsStore


class CoursePlugin(Plugin):
    id = "course"

    def register(self, app: FastAPI) -> None:
        from .routes import router as plugins_router
        from .routes_learning import ai_router, assets_router, progress_router, stats_router

        from app.stats_widgets import register_widget

        app.state.progress = ProgressStore(DATA_DIR)
        app.state.stats = StatsStore(DATA_DIR)
        app.include_router(plugins_router)
        app.include_router(progress_router)
        app.include_router(stats_router)
        app.include_router(ai_router)
        app.include_router(assets_router)

        # 课程插件为「统计」页贡献学习统计组件
        register_widget({"id": "studyDuration", "title": "累计学习时长", "source": "course",
                         "defaultSize": "md", "description": "课程学习的累计时长（课程插件提供）"})
        register_widget({"id": "dailyStudy", "title": "每日学习时长", "source": "course",
                         "defaultSize": "xl", "description": "每日学习时长分布（课程插件提供）"})
        register_widget({"id": "perCourse", "title": "各课程学习时长", "source": "course",
                         "defaultSize": "lg", "description": "每门课程的学习时长对比（课程插件提供）"})


plugin = CoursePlugin()
