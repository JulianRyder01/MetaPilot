# -*- coding: utf-8 -*-
"""世界语言插件的后端路由：提供语言目录与界面语言（词典）数据，前端实时拉取（非 mock）。

路由统一挂在 /api/plugins/world_languages/ 前缀下，并带 requires_plugin 门禁
（插件被禁用时返回 503 + 启用提示，符合插件开发规范 §4）。
"""
from fastapi import APIRouter, Depends

from app.plugins.base import requires_plugin

from .languages import LANGUAGES
from .ui_langs import UI_LANGS

router = APIRouter(
    prefix="/api/plugins/world_languages",
    tags=["world_languages"],
    dependencies=[Depends(requires_plugin("world_languages"))],
)


@router.get("/languages")
def list_languages():
    """语言目录：code / autonym（该语言自称）/ names（三语界面称呼）/ region（区域 key）。"""
    return {"count": len(LANGUAGES), "languages": LANGUAGES}


@router.get("/ui-langs")
def list_ui_langs():
    """界面语言清单（插件提供的界面语言 + 全量界面词典）：[{value, native, dict}]。
    前端经宿主 i18n 桥 registerLang 逐个注册；key 与核心词典一致，未覆盖词条回退简体中文。"""
    return {"count": len(UI_LANGS), "langs": UI_LANGS}
