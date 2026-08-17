"""核心 AI 问答 API（前缀 /api/ai）：通用多轮对话，复用统一 AI 网关。

- POST /api/ai/chat：把前端维护的对话历史（messages）交给统一网关调用
  用户配置的模型（openai 兼容 / anthropic / 本地模型），模型与密钥不出核心；
  不附带检索与上下文扩充，上下文完全由调用方（前端聊天面板）维护。
"""
from __future__ import annotations

from typing import List, Literal

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app.services.ai_gateway import AIError, NotConfiguredError

router = APIRouter(prefix="/api/ai", tags=["ai"])

MAX_MESSAGES = 100
MAX_CONTENT_LEN = 20000


class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str


class ChatIn(BaseModel):
    messages: List[ChatMessage]
    model: str = ""


def _gw(request: Request):
    return request.app.state.ai_gateway


@router.post("/chat")
async def chat(body: ChatIn, request: Request):
    """通用多轮对话：messages 为完整对话历史（system/user/assistant 交替）。"""
    if not body.messages:
        raise HTTPException(status_code=400, detail="messages 不能为空")
    if len(body.messages) > MAX_MESSAGES:
        raise HTTPException(status_code=400, detail=f"消息数量超过上限（{MAX_MESSAGES}），请先清空上下文")
    for m in body.messages:
        if not m.content.strip():
            raise HTTPException(status_code=400, detail="消息内容不能为空")
        if len(m.content) > MAX_CONTENT_LEN:
            raise HTTPException(status_code=400, detail="单条消息过长")

    gw = _gw(request)
    try:
        r = await gw.chat(
            [{"role": m.role, "content": m.content} for m in body.messages],
            model=body.model,
            plugin="core",
        )
    except (NotConfiguredError, AIError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {
        "content": r["content"],
        "model": r["model"],
        "provider": r["provider"],
    }