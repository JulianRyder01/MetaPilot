"""软链接插件路由：挂载本机目录，像文件系统一样浏览/读写。"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from app.plugins.base import requires_plugin
from .service import MountError, SymlinkService

router = APIRouter(
    prefix="/api/plugins/symlink",
    tags=["symlink"],
    dependencies=[Depends(requires_plugin("symlink"))],
)


class MountIn(BaseModel):
    name: str
    root: str


class MountRename(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    pinned: Optional[bool] = None


class FileIn(BaseModel):
    content: str


class PathIn(BaseModel):
    path: str = ""


class OpenIn(BaseModel):
    path: str = ""
    mode: str = "open"


class CanvasSaveIn(BaseModel):
    nodes: list = []
    edges: list = []


def _svc(request: Request):
    return request.app.state.symlink


def _default_target(request: Request) -> dict:
    """核心默认保存目标（软链接视作库的默认目标登记在这里，全局唯一）。"""
    return request.app.state.store.get_default_target()


def _err(e: Exception):
    if isinstance(e, KeyError):
        raise HTTPException(status_code=404, detail=str(e))
    if isinstance(e, (MountError, ValueError)):
        raise HTTPException(status_code=400, detail=str(e))
    raise HTTPException(status_code=500, detail=str(e))


@router.get("/fs/roots")
def fs_roots(request: Request):
    """文件选择器顶层入口：Windows 盘符列表 / Unix 根目录。"""
    return SymlinkService.fs_roots()


@router.get("/fs/list")
def fs_list(path: str = "", request: Request = None):
    """列出本机某个绝对目录（文件选择器导航）。"""
    try:
        return SymlinkService.fs_list(path)
    except Exception as e:
        _err(e)


@router.get("/mounts")
def list_mounts(request: Request):
    """挂载列表（软链接与库平级展示；默认且置顶 → 最前，置顶 → 其次，
    默认（未置顶）→ 紧随置顶组，其余保持挂载顺序；isDefault 由核心默认保存目标派生）。"""
    mounts = _svc(request).list_mounts()
    dt = _default_target(request)
    for m in mounts:
        m["isDefault"] = dt.get("kind") == "symlink" and dt.get("id") == m["id"]

    def sort_key(m: dict) -> int:
        pinned = bool(m.get("pinned"))
        is_default = bool(m.get("isDefault"))
        return 0 if (pinned and is_default) else (1 if pinned else (2 if is_default else 3))

    return sorted(mounts, key=sort_key)


@router.post("/mounts")
def add_mount(body: MountIn, request: Request):
    try:
        return _svc(request).add_mount(body.name.strip(), body.root.strip())
    except Exception as e:
        _err(e)


@router.put("/mounts/{mid}")
def rename_mount(mid: str, body: MountRename, request: Request):
    try:
        return _svc(request).rename_mount(mid, body.name.strip(), body.pinned)
    except Exception as e:
        _err(e)


@router.post("/mounts/{mid}/default")
def set_default_mount(mid: str, request: Request):
    """把该软链接设为默认保存目标（全局唯一，与库统一）。"""
    try:
        _svc(request).get_mount(mid)
        return request.app.state.store.set_default_target("symlink", mid)
    except Exception as e:
        _err(e)


@router.delete("/mounts/{mid}/default")
def clear_default_mount(mid: str, request: Request):
    """取消把该软链接作为默认保存目标（与置顶相互独立，可单独取消）。"""
    try:
        _svc(request).get_mount(mid)
        return request.app.state.store.clear_default_target("symlink", mid)
    except Exception as e:
        _err(e)


@router.delete("/mounts/{mid}")
def remove_mount(mid: str, request: Request):
    try:
        _svc(request).remove_mount(mid)
        # 卸载的是默认目标时清除默认标记，避免悬空
        request.app.state.store.clear_default_target("symlink", mid)
        return {"ok": True}
    except Exception as e:
        _err(e)


@router.get("/mounts/{mid}/tree")
def list_dir(mid: str, path: str = "", request: Request = None):
    try:
        return _svc(request).list_dir(mid, path)
    except Exception as e:
        _err(e)


@router.get("/mounts/{mid}/file")
def read_file(mid: str, path: str = "", request: Request = None):
    try:
        return _svc(request).read_file(mid, path)
    except Exception as e:
        _err(e)


@router.get("/mounts/{mid}/canvas")
def open_canvas(mid: str, path: str = "", request: Request = None):
    """打开挂载内 .canvas 源文件，转为 .mpf canvas 内容（nodes/edges）供图表编辑器编辑（不写源文件）。"""
    try:
        return _svc(request).read_canvas(mid, path)
    except Exception as e:
        _err(e)


@router.put("/mounts/{mid}/canvas")
def save_canvas(mid: str, path: str = "", body: CanvasSaveIn = None, request: Request = None):
    """把编辑后的图表（.mpf canvas 内容）转为 JSON Canvas 标准格式，写回源 .canvas 文件。"""
    try:
        return _svc(request).write_canvas(mid, path, body.nodes, body.edges)
    except Exception as e:
        _err(e)


@router.get("/mounts/{mid}/media")
def read_media(mid: str, path: str = "", request: Request = None):
    """读取挂载内媒体文件（图片/PDF/视频/音频）的二进制内容，供前端内联预览。"""
    from fastapi.responses import FileResponse

    svc = _svc(request)
    try:
        info = svc.media_info(mid, path)
        target = svc._resolve(svc.get_mount(mid), path)
    except Exception as e:
        _err(e)
    return FileResponse(
        target,
        media_type=info["mime"],
        headers={"Content-Disposition": f'inline; filename="{info["name"]}"'},
    )


@router.post("/mounts/{mid}/open")
def open_path(mid: str, body: OpenIn, request: Request):
    """在用户本机打开/定位挂载内文件（mode: open 默认方式打开 | reveal 文件管理器中显示）。"""
    try:
        return _svc(request).open_file(mid, body.path.strip("/\\"), body.mode)
    except Exception as e:
        _err(e)


@router.put("/mounts/{mid}/file")
def write_file(mid: str, path: str = "", body: FileIn = None, request: Request = None):
    try:
        return _svc(request).write_file(mid, path, body.content)
    except Exception as e:
        _err(e)


@router.post("/mounts/{mid}/mkdir")
def mkdir(mid: str, body: PathIn, request: Request):
    try:
        return _svc(request).mkdir(mid, body.path.strip("/\\"))
    except Exception as e:
        _err(e)


@router.delete("/mounts/{mid}/path")
def delete_path(mid: str, path: str = "", request: Request = None):
    try:
        return _svc(request).delete_path(mid, path)
    except Exception as e:
        _err(e)
