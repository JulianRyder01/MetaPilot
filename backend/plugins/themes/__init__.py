"""主题插件：提供多套特色视觉主题（中国风/霓虹蒸汽波/清新绿竹/商务简洁/星夜）。

主题数据由后端插件提供，前端通过 `GET /api/plugins/themes` 拉取，
在右上角主题面板 / 设置页中选装，并将 CSS 变量注入页面。
"""
from __future__ import annotations

from fastapi import FastAPI

from app.plugins.base import Plugin
from .themes_data import THEMES, validate_theme


class ThemesPlugin(Plugin):
    id = "themes"
    name = "主题"
    version = "1.0.0"
    description = "多套特色视觉主题（中国风/霓虹蒸汽波/清新绿竹/商务简洁/星夜），可在右上角主题面板或设置页选装"
    author = "MetaPilot"

    def register(self, app: FastAPI) -> None:
        # 注册前校验数据完整性，避免把坏数据暴露给前端
        for theme in THEMES:
            validate_theme(theme)
        from .routes import router as themes_router

        app.include_router(themes_router)


plugin = ThemesPlugin()
