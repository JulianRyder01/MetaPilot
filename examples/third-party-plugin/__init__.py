"""第三方插件示例（后端部分）：安装后立即生效，无需重启。

打包约定（docs/04-插件开发规范.md §前端 bundle）：
- 本目录（plugin.json + __init__.py + frontend/frontend.js）打成 zip 后在插件页上传安装；
- 后端能力经 APIRouter 挂载在 /api/plugins/<id>/ 前缀下；
- frontend/frontend.js 由后端托管，前端运行时动态加载并注册路由/导航。
"""
from fastapi import APIRouter

from app.plugins.base import Plugin

router = APIRouter(prefix="/api/plugins/demo_greeting", tags=["demo_greeting"])


@router.get("/hello")
def hello():
    return {"message": "你好，来自第三方插件 demo_greeting！"}


class DemoGreetingPlugin(Plugin):
    id = "demo_greeting"

    def register(self, app):
        app.include_router(router)


plugin = DemoGreetingPlugin()
