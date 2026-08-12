"""主题插件路由：返回主题清单（含亮/暗 CSS 变量），供前端主题面板/设置页选装。

被禁用时返回 503 + 启用提示（requires_plugin("themes")）。
"""
from __future__ import annotations

from fastapi import APIRouter, Depends

from app.plugins.base import requires_plugin
from .themes_data import THEMES

router = APIRouter(
    prefix="/api/plugins/themes",
    tags=["themes"],
    dependencies=[Depends(requires_plugin("themes"))],
)


@router.get("")
def list_themes():
    """主题清单：id/名称/描述/预览色 + 亮暗两套 CSS 变量。"""
    return THEMES
