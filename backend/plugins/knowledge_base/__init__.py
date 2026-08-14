"""个人知识库插件：对 默认库（含课程）与软链接挂载目录 多数据源向量编码，AI 问答并溯源。"""
from __future__ import annotations

from fastapi import FastAPI

from app.config import DATA_DIR
from app.plugins.base import Plugin
from .service import KBService

KB_DIR = DATA_DIR / "kb"


class KnowledgeBasePlugin(Plugin):
    id = "knowledge_base"

    def register(self, app: FastAPI) -> None:
        from .routes import router

        app.state.kb = KBService(app.state.store, KB_DIR)
        app.include_router(router)


plugin = KnowledgeBasePlugin()
