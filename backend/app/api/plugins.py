"""插件管理路由（核心）：清单 / 启用 / 禁用 / 前端 bundle 托管。"""
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse

from ..plugins.base import manager
from ..plugins.loader import PLUGINS_DIR

router = APIRouter(prefix="/api/plugins", tags=["plugins"])


@router.get("")
def plugin_list():
    return manager.list()


@router.get("/{pid}/frontend.js")
def plugin_frontend_bundle(pid: str):
    """托管插件包内 frontend/frontend.js（前端运行时动态加载第三方插件 UI）。

    路径净化：仅允许 PLUGINS_DIR/<pid>/frontend/frontend.js，防任意文件读取。
    """
    plugins_root = PLUGINS_DIR.resolve()
    target = (plugins_root / pid / "frontend" / "frontend.js").resolve()
    if not target.is_relative_to(plugins_root) or not target.is_file():
        raise HTTPException(status_code=404, detail=f"插件前端 bundle 不存在: {pid}")
    return FileResponse(target, media_type="application/javascript")


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
    """删除用户自定义插件（物理删除 PLUGINS_DIR/{pid} 目录）。"""
    try:
        manager.remove(pid)
        return {"ok": True}
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
