"""通用 MiniMax chat 调用（知识库问答等使用）。"""
from __future__ import annotations

import re
from typing import Any, Optional

import httpx

from ..config import settings


async def chat_completion(
    messages: list[dict],
    temperature: float = 0.3,
    max_tokens: int = 1024,
    response_format: Optional[dict] = None,
) -> str:
    """调用 MiniMax 兼容 OpenAI 接口，返回 message.content 文本。"""
    if not settings.minimax_api_key:
        raise RuntimeError("未配置 MINIMAX_API_KEY，请在 .env 中填写")
    body: dict[str, Any] = {
        "model": settings.minimax_model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if response_format:
        body["response_format"] = response_format
    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            f"{settings.minimax_base_url}/chat/completions",
            headers={"Authorization": f"Bearer {settings.minimax_api_key}"},
            json=body,
        )
        resp.raise_for_status()
        data = resp.json()
    content = data["choices"][0]["message"]["content"]
    # 剥除 MiniMax-M3 的 <think> 推理块，只返回最终回答
    return re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL).strip()
