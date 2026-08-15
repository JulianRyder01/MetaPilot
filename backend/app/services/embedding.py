"""Embedding 服务抽象：本地 transformers 服务通过 HTTP 提供向量。"""
from __future__ import annotations

import httpx

from ..config import settings
from .ai_config import AIConfig


def _config() -> AIConfig:
    """按需读取 AI 配置（模块级缓存避免重复读 .env）。"""
    global _ai_config
    if _ai_config is None:
        _ai_config = AIConfig()
    return _ai_config


_ai_config: AIConfig | None = None

# 可选 embedding 模型（模型 id → 展示名）：由 .env AI_EMBEDDING_MODELS 配置（JSON），
# 空则回退内置默认（Qwen3-Embedding 0.6B/4B）；不再在代码里写死模型清单。
EMBEDDING_MODELS: dict[str, str] = _config().embedding_models


class EmbeddingError(RuntimeError):
    pass


class EmbeddingProvider:
    def __init__(self, url: str = "", provider: str = "", model: str = ""):
        self.url = url or settings.embedding_url
        self.provider = provider or settings.embedding_provider
        self.model = model or settings.embedding_model

    def available(self) -> bool:
        return self.provider != "none"

    async def health(self) -> bool:
        if not self.available():
            return False
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                r = await client.get(f"{self.url}/health")
                return r.status_code == 200
        except Exception:
            return False

    async def embed(self, texts: list[str]) -> list[list[float]]:
        if not self.available():
            raise EmbeddingError("EMBEDDING_PROVIDER=none，个人知识库插件未启用")
        if not texts:
            return []
        try:
            async with httpx.AsyncClient(timeout=180) as client:
                r = await client.post(f"{self.url}/embed", json={"texts": texts})
                r.raise_for_status()
                data = r.json()
        except httpx.HTTPError as e:
            raise EmbeddingError(f"本地 embedding 服务不可用（{self.url}）：{e}。"
                                 "请先启动 embedding 服务（见 docs/05-个人知识库插件.md）")
        vectors = data.get("vectors")
        if not vectors:
            raise EmbeddingError("embedding 服务返回空向量")
        return vectors


embedding_provider = EmbeddingProvider()
