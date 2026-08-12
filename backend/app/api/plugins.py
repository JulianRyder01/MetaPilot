"""插件管理路由（核心）：清单 / 启用 / 禁用。"""
from fastapi import APIRouter, HTTPException, Request

from ..plugins.base import manager

router = APIRouter(prefix="/api/plugins", tags=["plugins"])


@router.get("")
def plugin_list():
    return manager.list()


@router.post("/{pid}/enable")
def plugin_enable(pid: str):
    try:
        return manager.enable(pid)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{pid}/disable")
def plugin_disable(pid: str):
    try:
        return manager.disable(pid)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
