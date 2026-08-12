"""Embedding 服务抽象：本地 transformers 服务通过 HTTP 提供向量。"""
from __future__ import annotations

import httpx

from ..config import settings


class EmbeddingError(RuntimeError):
    pass


class EmbeddingProvider:
    def __init__(self, url: str = "", provider: str = ""):
        self.url = url or settings.embedding_url
        self.provider = provider or settings.embedding_provider
        self.model = settings.embedding_model

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
