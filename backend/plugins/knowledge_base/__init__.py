"""个人知识库插件：对"库-文档集-文档-小节"向量编码，AI 问答并溯源文档。"""
from __future__ import annotations

from fastapi import FastAPI

from app.config import DATA_DIR
from app.plugins.base import Plugin
from .service import KBService

KB_DIR = DATA_DIR / "kb"


class KnowledgeBasePlugin(Plugin):
    id = "knowledge_base"
    name = "个人知识库"
    version = "1.0.0"
    description = "对库-文档集-文档-小节进行向量编码存储，支持 AI 提问并溯源每一个文档"
    author = "MetaPilot"

    def register(self, app: FastAPI) -> None:
        from .routes import router

        app.state.kb = KBService(app.state.store, KB_DIR)
        app.include_router(router)


plugin = KnowledgeBasePlugin()
