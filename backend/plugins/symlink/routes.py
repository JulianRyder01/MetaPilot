"""软链接插件路由：挂载本机目录，像文件系统一样浏览/读写。"""
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

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
    name: str


class FileIn(BaseModel):
    content: str


class PathIn(BaseModel):
    path: str = ""


class OpenIn(BaseModel):
    path: str = ""
    mode: str = "open"


def _svc(request: Request):
    return request.app.state.symlink


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
    return _svc(request).list_mounts()


@router.post("/mounts")
def add_mount(body: MountIn, request: Request):
    try:
        return _svc(request).add_mount(body.name.strip(), body.root.strip())
    except Exception as e:
        _err(e)


@router.put("/mounts/{mid}")
def rename_mount(mid: str, body: MountRename, request: Request):
    try:
        return _svc(request).rename_mount(mid, body.name.strip())
    except Exception as e:
        _err(e)


@router.delete("/mounts/{mid}")
def remove_mount(mid: str, request: Request):
    try:
        _svc(request).remove_mount(mid)
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
