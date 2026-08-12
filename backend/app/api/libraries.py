"""库与文档集（课程）路由。"""
from fastapi import APIRouter, HTTPException, Request

from ..schemas import CollectionIn, LibraryIn
from ..storage.store import LibraryStore

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
        return _store(request).update_library(lid, body.name, body.description)
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


@router.delete("/collections/{cid}")
def delete_collection(cid: str, request: Request):
    try:
        _store(request).delete_collection(cid)
        return {"ok": True}
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
