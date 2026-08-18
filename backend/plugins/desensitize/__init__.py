"""脱敏工具插件（本地去敏感信息）：用本机 ollama 部署的小模型（默认 qwen3.5:4b，可改）识别
敏感信息，插件内置开放替换/涂黑工具集，把导入文档（文本/markdown/pdf/图片）中的敏感内容
替换为黑块（█）或涂黑，并标出所有敏感信息供用户确认后再应用。

- 后端：/api/plugins/desensitize/*（状态/配置/模型拉取 → 识别（analyze）→ 应用（apply）/文件涂黑（file/redact））
- 前端：frontend/frontend.js 运行时动态加载 demo 页（即插即用，不含 mock，全部真实调用后端 API）
"""
from __future__ import annotations

from fastapi import FastAPI

from app.plugins.base import Plugin
from app.services.ai_config import AIConfig
from app.services.ollama import OllamaClient

from .service import DesensitizeService


class DesensitizePlugin(Plugin):
    id = "desensitize"

    def register(self, app: FastAPI) -> None:
        from .routes import router

        config: AIConfig = app.state.ai_gateway.config
        app.state.desensitize = DesensitizeService(ollama=OllamaClient(config=config),
                                                   config=config)
        app.include_router(router)


plugin = DesensitizePlugin()
