"""库与文档集（课程）路由。"""
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from ..schemas import CollectionIn, LibraryIn
from ..storage.store import LibraryStore, find_collection

router = APIRouter(prefix="/api", tags=["libraries"])


def _store(request: Request) -> LibraryStore:
    return request.app.state.store


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
        raise HTTPException(status_code=404, detail=str(e))


@router.put("/libraries/{lid}")
def update_library(lid: str, body: LibraryIn, request: Request):
    try:
        return _store(request).update_library(lid, body.name, body.description,
                                              body.pinned, body.isDefault)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/libraries/{lid}/default")
def set_default_library(lid: str, request: Request):
    """把指定库设为默认库（唯一）：AI 洞察等插件的默认保存目标。"""
    try:
        return _store(request).set_default_library(lid)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/libraries/{lid}")
def delete_library(lid: str, request: Request):
    _store(request).delete_library(lid)
    return {"ok": True}


@router.post("/libraries/{lid}/collections")
def create_collection(lid: str, body: CollectionIn, request: Request):
    try:
        return _store(request).create_collection(lid, body.model_dump())
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.put("/collections/{cid}")
def update_collection(cid: str, body: CollectionIn, request: Request):
    try:
        return _store(request).update_collection(cid, body.model_dump())
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/collections/{cid}")
def get_collection(cid: str, request: Request):
    for it in _store(request).list_libraries():
        lib = _store(request).get_library(it["id"])
        col = find_collection(lib, cid)
        if col is not None:
            return col
    raise HTTPException(status_code=404, detail=f"文档集不存在: {cid}")


class CanvasIn(BaseModel):
    nodes: list[dict] = []
    edges: list[dict] = []


@router.put("/collections/{cid}/canvas")
def update_collection_canvas(cid: str, body: CanvasIn, request: Request):
    """保存图表画布（canvas 集合的 nodes/edges）。"""
    try:
        return _store(request).update_collection(cid, {"canvas": {"nodes": body.nodes, "edges": body.edges}})
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/collections/{cid}")
def delete_collection(cid: str, request: Request):
    try:
        _store(request).delete_collection(cid)
        return {"ok": True}
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
