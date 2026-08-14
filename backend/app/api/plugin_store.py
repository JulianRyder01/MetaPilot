"""插件商店路由（核心）：商店清单 / 从商店安装 / 发布到商店 / 本地上传安装。

- 商店清单与安装依赖 .env 的 PLUGIN_STORE_URL（未配置返回 400 + 提示）；
- 本地上传安装（POST /api/plugins/upload）不依赖商店，zip 校验后安装为 user 插件。
"""
from __future__ import annotations

from fastapi import APIRouter, File, HTTPException, Request, UploadFile

from ..plugins.installer import PluginInstallError, install_user_plugin, parse_plugin_meta
from ..services import plugin_store
from ..services.plugin_store import PluginStoreError

router = APIRouter(prefix="/api/plugins", tags=["plugins-store"])


@router.get("/store/plugins")
async def store_catalog():
    """从插件商店拉取插件清单。"""
    try:
        return await plugin_store.fetch_catalog()
    except PluginStoreError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/store/plugins/{pid}/install")
async def store_install(pid: str, request: Request):
    """从商店下载插件包并安装为本地 user 插件（立即生效）。"""
    try:
        data = await plugin_store.download_package(pid)
        info = install_user_plugin(request.app, data)
        return {"installed": True, **info}
    except PluginStoreError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except PluginInstallError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/store/publish")
async def store_publish(file: UploadFile = File(...)):
    """把自制插件包发布到插件商店（校验由商店执行）。"""
    data = await file.read()
    try:
        # 先本地做基础校验（给用户即时反馈），再提交商店
        parse_plugin_meta(data)
        return await plugin_store.publish_package(data, file.filename or "plugin.zip")
    except PluginInstallError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except PluginStoreError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/upload")
async def plugin_upload(file: UploadFile = File(...), request: Request = None):
    """上传 zip 本地安装为 user 插件（不经过商店）。"""
    data = await file.read()
    try:
        return install_user_plugin(request.app, data)
    except PluginInstallError as e:
        raise HTTPException(status_code=400, detail=str(e))
