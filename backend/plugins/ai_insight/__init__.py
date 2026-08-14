"""AI 洞察插件：对 库文档（库/文档集/文档）与 软链接本机目录（挂载或挂载内路径）
多粒度数据源建立向量索引，用 AI 查阅资料间的联系并生成内容。

- 四类思考模式：辅助思考 / 思维漫游 / 反思归纳 / 洞察规划（多轮 agent 生成图表或课程）。
- 数据源选择灵活：库、单个文档集、单个文档、整个软链接挂载或挂载内任意目录/文件。
"""
from __future__ import annotations

from fastapi import FastAPI

from app.config import DATA_DIR
from app.plugins.base import Plugin
from .service import InsightService

INSIGHT_DIR = DATA_DIR / "ai_insight"


class AiInsightPlugin(Plugin):
    id = "ai_insight"

    def register(self, app: FastAPI) -> None:
        from .routes import router

        app.state.ai_insight = InsightService(app.state.store, INSIGHT_DIR)
        app.include_router(router)


plugin = AiInsightPlugin()
