# -*- coding: utf-8 -*-
"""世界语言插件（后端部分）：按当前界面语言展示全世界语言的自称与本地化称呼。

打包约定（docs/04-插件开发规范.md §6.2）：
- 本目录（plugin.json + __init__.py + routes.py + languages.py + frontend/frontend.js）
  打成 zip 后在插件页「本地插件 → 上传插件」或「插件商店 → 上传」安装，立即生效；
- 后端能力经 APIRouter 挂载在 /api/plugins/world_languages/ 前缀下（带门禁）；
- frontend/frontend.js 由后端托管，前端运行时动态加载并注册路由/导航与词典。

本插件为完全自包含的用户自定义插件：未安装时，宿主核心没有任何与之相关的代码与行为。
"""
from fastapi import FastAPI

from app.plugins.base import Plugin


class WorldLanguagesPlugin(Plugin):
    id = "world_languages"

    def register(self, app: FastAPI) -> None:
        from .routes import router

        app.include_router(router)


plugin = WorldLanguagesPlugin()
