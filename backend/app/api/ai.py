"""AI 判题路由：POST /api/ai/grade。"""
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..services.ai_grader import AIGrader

router = APIRouter(prefix="/api/ai", tags=["ai"])


class GradeIn(BaseModel):
    blockType: Literal["fill_blank", "short_answer"]
    question: str
    reference: str = ""
    keywords: list[str] = []
    blanks: list[str] = []
    userAnswer: str


@router.post("/grade")
async def grade(body: GradeIn):
    g = AIGrader()
    try:
        return await g.grade(body.model_dump())
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI 判题失败: {e}")
