"""库与文件夹路由。

统一文件夹层级：库 → 文件夹（可嵌套）→ 文档。
- 顶层文件夹（原文档集：课程/图表/笔记等，含 kind）经 /api/folders 管理；
- 嵌套文件夹（顶层文件夹内的目录层级）同样经 /api/folders/{id}（按 id 区分顶层/嵌套）；
- 旧 /api/collections 路径保留为别名（兼容历史调用）。
"""
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from ..schemas import DefaultTargetIn, FolderIn, FolderPatch, LibraryIn, SubfolderIn
from ..storage.store import LibraryStore

router = APIRouter(prefix="/api", tags=["libraries"])


def _store(request: Request) -> LibraryStore:
    return request.app.state.store


def _folder_not_found(e: KeyError):
    raise HTTPException(status_code=404, detail=str(e))


@router.get("/libraries")
def list_libraries(request: Request):
    return _store(request).list_libraries()


@router.post("/libraries")
def create_library(body: LibraryIn, request: Request):
    return _store(request).create_library(body.name, body.description)


@router.get("/libraries/{lid}")
def get_library(lid: str, request: Request):
    try:
        return _store(request).get_library(lid)
    except KeyError as e:
        _folder_not_found(e)


@router.put("/libraries/{lid}")
def update_library(lid: str, body: LibraryIn, request: Request):
    try:
        return _store(request).update_library(lid, body.name, body.description, body.pinned)
    except KeyError as e:
        _folder_not_found(e)


@router.post("/libraries/{lid}/default")
def set_default_library(lid: str, request: Request):
    """把指定库设为默认保存目标（全局唯一，含软链接）。"""
    try:
        return _store(request).set_default_library(lid)
    except KeyError as e:
        _folder_not_found(e)


@router.delete("/libraries/{lid}")
def delete_library(lid: str, request: Request):
    _store(request).delete_library(lid)
    return {"ok": True}


# ---------------- 默认保存目标（库 / 软链接统一，唯一） ----------------

@router.get("/default-target")
def get_default_target(request: Request):
    """默认保存目标（{kind, id}）：库或软链接，全局唯一，供 AI 洞察等插件读取。"""
    return _store(request).get_default_target()


@router.put("/default-target")
def set_default_target(body: DefaultTargetIn, request: Request):
    """设置默认保存目标（软链接插件经此登记 symlink 目标）。"""
    if body.kind == "library":
        try:
            _store(request).get_library(body.id)
        except KeyError as e:
            _folder_not_found(e)
    return _store(request).set_default_target(body.kind, body.id)


# ---------------- 顶层文件夹（原文档集） ----------------

@router.post("/libraries/{lid}/folders")
def create_folder(lid: str, body: FolderIn, request: Request):
    try:
        return _store(request).create_folder(lid, body.model_dump())
    except KeyError as e:
        _folder_not_found(e)


@router.get("/folders/{fid}")
def get_folder(fid: str, request: Request):
    try:
        return _store(request).get_folder_any(fid)
    except KeyError as e:
        _folder_not_found(e)


@router.put("/folders/{fid}")
def update_folder(fid: str, body: FolderPatch, request: Request):
    """更新文件夹（顶层或嵌套，按 id 区分）。"""
    try:
        return _store(request).update_folder_any(fid, body.model_dump(exclude_none=True))
    except KeyError as e:
        _folder_not_found(e)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


class CanvasIn(BaseModel):
    nodes: list[dict] = []
    edges: list[dict] = []


@router.put("/folders/{fid}/canvas")
def update_folder_canvas(fid: str, body: CanvasIn, request: Request):
    """保存图表画布（canvas 顶层文件夹的 nodes/edges）。"""
    try:
        return _store(request).update_folder(fid, {"canvas": {"nodes": body.nodes, "edges": body.edges}})
    except KeyError as e:
        _folder_not_found(e)


@router.delete("/folders/{fid}")
def delete_folder(fid: str, request: Request):
    try:
        _store(request).delete_folder_any(fid)
        return {"ok": True}
    except KeyError as e:
        _folder_not_found(e)


# ---------------- 嵌套文件夹（顶层文件夹内的目录层级） ----------------

@router.post("/folders/{fid}/folders")
def create_subfolder(fid: str, body: SubfolderIn, request: Request):
    try:
        return _store(request).create_subfolder(fid, body.model_dump(by_alias=True, exclude_unset=True))
    except KeyError as e:
        _folder_not_found(e)


# ---------------- 旧路径别名（/api/collections → /api/folders，兼容） ----------------

@router.post("/libraries/{lid}/collections")
def create_collection_alias(lid: str, body: FolderIn, request: Request):
    return create_folder(lid, body, request)


@router.get("/collections/{cid}")
def get_collection_alias(cid: str, request: Request):
    return get_folder(cid, request)


@router.put("/collections/{cid}")
def update_collection_alias(cid: str, body: FolderPatch, request: Request):
    return update_folder(cid, body, request)


@router.put("/collections/{cid}/canvas")
def update_collection_canvas_alias(cid: str, body: CanvasIn, request: Request):
    return update_folder_canvas(cid, body, request)


@router.delete("/collections/{cid}")
def delete_collection_alias(cid: str, request: Request):
    return delete_folder(cid, request)


@router.post("/collections/{cid}/folders")
def create_subfolder_alias(cid: str, body: SubfolderIn, request: Request):
    return create_subfolder(cid, body, request)
