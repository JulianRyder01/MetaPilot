"""官方核心 · 统计路由（统计页 core 组件数据源，无插件门禁）。"""
from fastapi import APIRouter, Request
from pydantic import BaseModel

from ..services import stats_core as sc
from ..stats_widgets import list_widgets

router = APIRouter(prefix="/api/stats", tags=["stats-core"])


class VisitIn(BaseModel):
    collectionId: str
    documentId: str
    documentName: str = ""
    durationSec: int = 0


@router.post("/core/visit")
def record_visit(body: VisitIn, request: Request):
    return sc.stats_core_service.record_visit(
        body.collectionId, body.documentId, body.documentName, body.durationSec
    )


@router.get("/core/summary")
def core_summary(request: Request):
    return sc.stats_core_service.summary()


@router.get("/widgets")
def stats_widgets(request: Request):
    """统计页组件清单（core + 各插件注册）。"""
    return list_widgets()
