"""文件夹路由：文档集内部的目录层级（嵌套文件夹 + 文档归入文件夹）。"""
from fastapi import APIRouter, HTTPException, Request

from ..schemas import FolderIn, FolderUpdate
from ..storage.store import LibraryStore

router = APIRouter(prefix="/api", tags=["folders"])


def _store(request: Request) -> LibraryStore:
    return request.app.state.store


@router.post("/collections/{cid}/folders")
def create_folder(cid: str, body: FolderIn, request: Request):
    try:
        return _store(request).create_folder(cid, body.model_dump(by_alias=True, exclude_unset=True))
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.put("/folders/{fid}")
def update_folder(fid: str, body: FolderUpdate, request: Request):
    try:
        return _store(request).update_folder(fid, body.model_dump(by_alias=True, exclude_unset=True))
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/folders/{fid}")
def delete_folder(fid: str, request: Request):
    try:
        _store(request).delete_folder(fid)
        return {"ok": True}
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
