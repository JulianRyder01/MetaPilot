"""集合类型（kind）元数据路由（核心）：合并官方核心类型与插件声明的类型。

kind 是核心 .mpf 数据模型的集合类型字段（course/note/kb/canvas 等）；
本端点返回 kind → {labelKey, icon, openRoute, unitLabelKey, pluginId}，
前端据此渲染类型图标/名称/打开路由，不再写死 kind → 插件路由的映射。
"""
from fastapi import APIRouter

from ..plugins.base import manager

router = APIRouter(prefix="/api", tags=["collection-kinds"])


@router.get("/collection-kinds")
def collection_kinds():
    """全部集合类型元数据：核心类型 + 插件声明（插件覆盖同名核心类型）。"""
    return manager.collection_kinds()
