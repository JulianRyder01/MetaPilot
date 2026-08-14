"""MetaPilot 插件商店（独立部署服务）。

插件商店单独部署在一台服务器上，提供插件清单、下载与上传接口；
MetaPilot 主后端通过 PLUGIN_STORE_URL 从这里拉取插件清单并下载安装
（见主仓库 docs/04-插件开发规范.md §10 插件商店）。
"""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

from .catalog import INDEX_PATH, PACKAGES_DIR, load_index, rebuild_index
from .validation import ValidationError, parse_plugin_package


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # 启动时重建清单，保证 index.json 与 packages/ 一致
    rebuild_index()
    yield


app = FastAPI(title="MetaPilot 插件商店", version="1.0.0", lifespan=lifespan)


@app.get("/")
def root():
    return {
        "name": "MetaPilot 插件商店",
        "version": "1.0.0",
        "api": {"plugins": "/api/store/plugins", "docs": "/docs"},
        "note": "插件开发规范见仓库 plugins-store/docs/04-插件开发规范.md（与主仓库 docs/04 同步）",
    }


@app.get("/api/store/health")
def health():
    return {"ok": True}


@app.get("/api/store/plugins")
def list_plugins():
    """插件清单（含元数据与 tags，供主后端与前端商店页使用）。"""
    return load_index()


@app.get("/api/store/plugins/{pid}/download")
def download_plugin(pid: str):
    """下载插件包 zip。"""
    pkg = PACKAGES_DIR / f"{pid}.zip"
    if not pkg.is_file():
        raise HTTPException(status_code=404, detail=f"插件不存在: {pid}")
    return FileResponse(pkg, media_type="application/zip", filename=f"{pid}.zip")


@app.post("/api/store/plugins/upload")
async def upload_plugin(file: UploadFile = File(...)):
    """上传插件包 zip（校验 plugin.json 与 tags 白名单），入库并更新清单。"""
    data = await file.read()
    try:
        meta = parse_plugin_package(data)
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))

    pid = meta["id"]
    (PACKAGES_DIR / f"{pid}.zip").write_bytes(data)
    rebuild_index()
    return meta


if __name__ == "__main__":  # pragma: no cover
    import uvicorn

    uvicorn.run("store.main:app", host="0.0.0.0", port=8100)
