"""课程插件 · 学习相关路由：进度、时长统计、主观题 AI 判题、交互块资产。

这些能力属于「课程」插件：禁用课程插件后，学习进度/统计/AI 判题/交互块均不可用
（返回 503 + 启用提示）。MetaPilot 核心仅保留文档库的浏览与 Markdown 阅读。
"""
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.plugins.base import requires_plugin
from app.services.ai_grader import AIGrader
from app.storage.progress import ProgressStore
from app.storage.stats import StatsStore

# ---------------- 学习进度 ----------------

progress_router = APIRouter(
    prefix="/api/plugins/course/progress",
    tags=["course-progress"],
    dependencies=[Depends(requires_plugin("course"))],
)


class PositionIn(BaseModel):
    documentId: str
    sectionId: str


def _progress(request: Request) -> ProgressStore:
    return request.app.state.progress


@progress_router.get("/{cid}")
def get_progress(cid: str, request: Request):
    return _progress(request).get(cid)


@progress_router.put("/{cid}/toggle/{sid}")
def toggle_completed(cid: str, sid: str, request: Request):
    completed = _progress(request).toggle_completed(cid, sid)
    return {"completed": completed}


@progress_router.put("/{cid}/completed/{sid}")
def set_completed(cid: str, sid: str, completed: bool = True, request: Request = None):
    _progress(request).set_completed(cid, sid, completed)
    return {"ok": True}


@progress_router.put("/{cid}/position")
def set_position(cid: str, body: PositionIn, request: Request):
    _progress(request).set_position(cid, body.documentId, body.sectionId)
    return {"ok": True}


@progress_router.get("/")
def all_progress(request: Request):
    return _progress(request).all()


# ---------------- 学习时长统计 ----------------

stats_router = APIRouter(
    prefix="/api/plugins/course/stats",
    tags=["course-stats"],
    dependencies=[Depends(requires_plugin("course"))],
)


class SessionIn(BaseModel):
    collectionId: str
    documentId: str = ""
    sectionId: str = ""
    startAt: str = ""
    endAt: str = ""
    durationSec: int = 0


def _stats(request: Request) -> StatsStore:
    return request.app.state.stats


@stats_router.post("/sessions")
def add_session(body: SessionIn, request: Request):
    return _stats(request).add_session(body.model_dump())


@stats_router.get("/summary")
def summary(range: str = "all", request: Request = None):
    data = _stats(request).summary(range)
    # 补充课程名称：perCollection 原本只有 id，前端按名展示
    store = getattr(request.app.state, "store", None)
    if store is not None:
        names: dict[str, str] = {}
        for it in store.list_libraries():
            try:
                lib = store.get_library(it["id"])
            except KeyError:
                continue
            for c in lib.get("folders", lib.get("collections", [])):
                names[c["id"]] = c.get("name") or ""
        for p in data.get("perCollection", []):
            p["name"] = names.get(p["collectionId"], "")
    return data


# ---------------- 主观题 AI 判题 ----------------

ai_router = APIRouter(
    prefix="/api/plugins/course/ai",
    tags=["course-ai"],
    dependencies=[Depends(requires_plugin("course"))],
)


class GradeIn(BaseModel):
    blockType: Literal["fill_blank", "short_answer"]
    question: str
    reference: str = ""
    keywords: list[str] = []
    blanks: list[str] = []
    userAnswer: str


@ai_router.post("/grade")
async def grade(body: GradeIn, request: Request):
    # 统一 AI 网关（核心 1.1.1）：判题经 MetaPilot 中转并统计用量；网关不可用时回退旧直连
    g = AIGrader(gateway=getattr(request.app.state, "ai_gateway", None))
    try:
        # 用量归属本（课程）插件，由插件自身声明，核心不写死
        return await g.grade(body.model_dump(), plugin_id="course")
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI 判题失败: {e}")


# ---------------- 动态交互块资产 ----------------

assets_router = APIRouter(
    prefix="/api/plugins/course/assets",
    tags=["course-assets"],
    dependencies=[Depends(requires_plugin("course"))],
)


@assets_router.get("/{cid}/{file:path}")
def course_asset(cid: str, file: str, request: Request):
    importer = request.app.state.importer
    base = (Path(importer.assets_dir) / cid).resolve()
    target = (base / file).resolve()
    if not str(target).startswith(str(base)) or not target.is_file():
        raise HTTPException(status_code=404, detail="资源不存在")
    return FileResponse(target)
