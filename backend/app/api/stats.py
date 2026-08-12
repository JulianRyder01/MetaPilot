"""学习时长统计路由。"""
from fastapi import APIRouter, Request
from pydantic import BaseModel

from ..storage.stats import StatsStore

router = APIRouter(prefix="/api/stats", tags=["stats"])


class SessionIn(BaseModel):
    collectionId: str
    documentId: str = ""
    sectionId: str = ""
    startAt: str = ""
    endAt: str = ""
    durationSec: int = 0


def _store(request: Request) -> StatsStore:
    return request.app.state.stats


@router.post("/sessions")
def add_session(body: SessionIn, request: Request):
    return _store(request).add_session(body.model_dump())


@router.get("/summary")
def summary(range: str = "all", request: Request = None):
    return _store(request).summary(range)
