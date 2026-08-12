"""学习进度路由（每课程独立）。"""
from typing import Optional

from fastapi import APIRouter, Request
from pydantic import BaseModel

from ..storage.progress import ProgressStore

router = APIRouter(prefix="/api/progress", tags=["progress"])


class PositionIn(BaseModel):
    documentId: str
    sectionId: str


def _store(request: Request) -> ProgressStore:
    return request.app.state.progress


@router.get("/{cid}")
def get_progress(cid: str, request: Request):
    return _store(request).get(cid)


@router.put("/{cid}/toggle/{sid}")
def toggle_completed(cid: str, sid: str, request: Request):
    completed = _store(request).toggle_completed(cid, sid)
    return {"completed": completed}


@router.put("/{cid}/completed/{sid}")
def set_completed(cid: str, sid: str, completed: bool = True, request: Request = None):
    _store(request).set_completed(cid, sid, completed)
    return {"ok": True}


@router.put("/{cid}/position")
def set_position(cid: str, body: PositionIn, request: Request):
    _store(request).set_position(cid, body.documentId, body.sectionId)
    return {"ok": True}


@router.get("/")
def all_progress(request: Request):
    return _store(request).all()
