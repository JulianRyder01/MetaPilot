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
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{pid}")
def plugin_delete(pid: str):
    """删除用户自定义插件（物理删除 backend/plugins/{pid} 目录）。"""
    try:
        manager.remove(pid)
        return {"ok": True}
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
