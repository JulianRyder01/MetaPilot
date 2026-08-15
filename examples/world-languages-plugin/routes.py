# -*- coding: utf-8 -*-
"""世界语言插件的后端路由：提供语言目录数据，前端页面实时拉取（非 mock）。

路由统一挂在 /api/plugins/world_languages/ 前缀下，并带 requires_plugin 门禁
（插件被禁用时返回 503 + 启用提示，符合插件开发规范 §4）。
"""
from fastapi import APIRouter, Depends

from app.plugins.base import requires_plugin

from .languages import LANGUAGES

router = APIRouter(
    prefix="/api/plugins/world_languages",
    tags=["world_languages"],
    dependencies=[Depends(requires_plugin("world_languages"))],
)


@router.get("/languages")
def list_languages():
    """语言目录：code / autonym（该语言自称）/ names（三语界面称呼）/ region（区域 key）。"""
    return {"count": len(LANGUAGES), "languages": LANGUAGES}
