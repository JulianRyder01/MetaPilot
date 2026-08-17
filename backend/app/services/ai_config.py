"""AI 统一配置：从 .env 读取，支持运行时更新（写回 .env 文件，配置不上云）。

所有 API 调用方式（provider 类型 / 地址 / key / 模型 / 价格）都存 .env；
旧配置兼容：未设置 AI_* 新字段时，回退 minimax_*（判题/问答）与 embedding_*（本地向量）。
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Optional

from dotenv import dotenv_values, set_key

from ..config import ENV_FILE

ENV_PATH = ENV_FILE

# 云端 provider 类型
CLOUD_PROVIDERS = ["openai", "anthropic"]
ALL_PROVIDERS = ["openai", "anthropic", "local", "none"]
CURRENCIES = ["$", "¥"]
DEFAULT_CURRENCY = "$"

# 内置本地模型预置（需要时一键下载；embedding 可选 0.6B/4B，llm/rerank 可选）
LOCAL_MODELS: dict[str, dict] = {
    "embedding": {
        "kind": "embedding", "id": "Qwen/Qwen3-Embedding-0.6B",
        "name": "Qwen3-Embedding-0.6B", "role": "向量（轻量，默认）", "size": "约 2GB",
    },
    "embedding_4b": {
        "kind": "embedding", "id": "Qwen/Qwen3-Embedding-4B",
        "name": "Qwen3-Embedding-4B", "role": "向量（更强，需更多显存）", "size": "约 10GB+",
    },
    "llm": {
        "kind": "llm", "id": "Qwen/Qwen3-4B",
        "name": "Qwen3-4B", "role": "对话（内置 LLM）", "size": "约 8GB",
    },
    "rerank": {
        "kind": "rerank", "id": "Qwen/Qwen3-Reranker-0.6B",
        "name": "Qwen3-Reranker-0.6B", "role": "重排（可选）", "size": "约 2GB",
    },
}

# 默认 embedding 模型列表（模型 id → 展示名）：可被 .env 的 AI_EMBEDDING_MODELS（JSON）整体覆盖/扩展
def _default_embedding_models() -> dict[str, str]:
    out: dict[str, str] = {}
    for m in LOCAL_MODELS.values():
        if m["kind"] == "embedding":
            out[m["id"]] = m["name"] + f"（{m['role']}）"
    return out

# 默认价格（每百万 token）：给未配置价格的模型一个兜底
DEFAULT_PRICES: dict[str, dict] = {
    "MiniMax-M3": {"input": 4.0, "cachedInput": 0.0, "output": 12.0, "currency": "¥"},
    "Qwen/Qwen3-4B": {"input": 0.0, "cachedInput": 0.0, "output": 0.0, "currency": "$"},
}


def _mask(key: str) -> str:
    """密钥掩码展示：sk-abc...xyz。"""
    if not key:
        return ""
    if len(key) <= 10:
        return key[:2] + "***"
    return f"{key[:6]}...{key[-4:]}"


class AIConfig:
    """AI 统一配置（内存缓存 + .env 持久化）。"""

    def __init__(self, env_path: Optional[Path] = None):
        self.env_path = Path(env_path) if env_path else ENV_PATH
        self._cache: dict = {}
        self.reload()

    # ---------------- 读取 ----------------

    def reload(self) -> None:
        """重新从 .env 加载全部 AI 配置（不污染全局 os.environ：environ 已有值优先）。"""
        file_vals = dotenv_values(self.env_path) if self.env_path.exists() else {}
        self._values = {**file_vals, **os.environ}
        self._cache = self._read_env()

    def _get(self, key: str, default: str = "") -> str:
        return self._values.get(key, default)

    def _read_env(self) -> dict:
        # 云端 chat provider：优先 AI_*，回退 minimax_*（openai 兼容）
        provider = self._get("AI_PROVIDER")
        if not provider:
            provider = "openai" if self._get("MINIMAX_API_KEY") else "none"
        base_url = self._get("AI_BASE_URL") or self._get("MINIMAX_BASE_URL") or ""
        api_key = self._get("AI_API_KEY") or self._get("MINIMAX_API_KEY") or ""
        chat_model = self._get("AI_CHAT_MODEL") or self._get("MINIMAX_MODEL") or ""

        # embedding 独立配置：local_transformers | openai | none
        embed_provider = self._get("AI_EMBEDDING_PROVIDER") or self._get("EMBEDDING_PROVIDER") or "local_transformers"
        embed_url = self._get("AI_EMBEDDING_URL") or self._get("EMBEDDING_URL") or "http://127.0.0.1:8760"
        embed_model = self._get("AI_EMBEDDING_MODEL") or self._get("EMBEDDING_MODEL") or "Qwen/Qwen3-Embedding-0.6B"

        prices_raw = self._get("AI_MODEL_PRICES", "{}")
        try:
            prices = json.loads(prices_raw) if prices_raw.strip() else {}
        except json.JSONDecodeError:
            prices = {}
        # 旧字段映射的模型补默认价
        for mid, p in DEFAULT_PRICES.items():
            prices.setdefault(mid, dict(p))

        # embedding 模型列表（AI_EMBEDDING_MODELS JSON）与下载说明（AI_EMBEDDING_HINT），
        # 均为可配置的可变项：未配置时回退内置默认，前端只渲染后端下发的值，不写死
        models_raw = self._get("AI_EMBEDDING_MODELS", "")
        try:
            models = json.loads(models_raw) if models_raw.strip() else {}
        except json.JSONDecodeError:
            models = {}
        embedding_models = models if models else _default_embedding_models()

        return {
            "provider": provider,
            "baseUrl": base_url,
            "apiKey": api_key,
            "chatModel": chat_model,
            "embeddingProvider": embed_provider,
            "embeddingUrl": embed_url,
            "embeddingModel": embed_model,
            "embeddingModels": embedding_models,
            "embeddingDownloadHint": self._get(
                "AI_EMBEDDING_HINT",
                "模型下载多路自动尝试（ModelScope → HF-Mirror → HuggingFace），首次下载需等待模型就绪，页面会自动刷新状态。",
            ),
            "localLlmUrl": self._get("AI_LOCAL_LLM_URL", "http://127.0.0.1:8761"),
            "rerankUrl": self._get("AI_RERANK_URL", "http://127.0.0.1:8762"),
            "localLlmModel": self._get("AI_LOCAL_LLM_MODEL", "Qwen/Qwen3-4B"),
            "rerankModel": self._get("AI_RERANK_MODEL", "Qwen/Qwen3-Reranker-0.6B"),
            "prices": prices,
            "currency": self._get("AI_CURRENCY", DEFAULT_CURRENCY),
        }

    # ---------------- 属性 ----------------

    @property
    def provider(self) -> str:
        return self._cache["provider"]

    @property
    def base_url(self) -> str:
        return self._cache["baseUrl"]

    @property
    def api_key(self) -> str:
        return self._cache["apiKey"]

    @property
    def chat_model(self) -> str:
        return self._cache["chatModel"]

    @property
    def embedding_provider(self) -> str:
        return self._cache["embeddingProvider"]

    @property
    def embedding_url(self) -> str:
        return self._cache["embeddingUrl"]

    @property
    def embedding_model(self) -> str:
        return self._cache["embeddingModel"]

    @property
    def embedding_models(self) -> dict:
        """可选 embedding 模型列表（模型 id → 展示名）；由 AI_EMBEDDING_MODELS 配置，空则内置默认。"""
        return dict(self._cache["embeddingModels"])

    @property
    def embedding_download_hint(self) -> str:
        """embedding 模型下载说明（前端展示用）；由 AI_EMBEDDING_HINT 配置，空则内置默认。"""
        return self._cache["embeddingDownloadHint"]

    @property
    def local_llm_url(self) -> str:
        return self._cache["localLlmUrl"]

    @property
    def rerank_url(self) -> str:
        return self._cache["rerankUrl"]

    @property
    def local_llm_model(self) -> str:
        return self._cache["localLlmModel"]

    @property
    def rerank_model(self) -> str:
        return self._cache["rerankModel"]

    @property
    def prices(self) -> dict:
        return self._cache["prices"]

    @property
    def currency(self) -> str:
        return self._cache["currency"]

    def price_for(self, model: str) -> Optional[dict]:
        """某模型的单价表（每百万 token）；未配置返回 None。"""
        return self.prices.get(model)

    def masked_key(self) -> str:
        return _mask(self.api_key)

    def to_public(self) -> dict:
        """给设置页展示的配置（key 掩码，含本地模型清单与状态字段占位）。"""
        c = dict(self._cache)
        c["apiKey"] = self.masked_key()
        c["apiKeyConfigured"] = bool(self.api_key)
        c["providers"] = ALL_PROVIDERS
        c["currencies"] = CURRENCIES
        c["defaultCurrency"] = DEFAULT_CURRENCY
        c["localModels"] = LOCAL_MODELS
        return c

    # ---------------- 更新（写回 .env） ----------------

    def _set_env(self, key: str, value: str) -> None:
        if value is None:
            return
        set_key(str(self.env_path), key, value, quote_mode="never" if key == "AI_MODEL_PRICES" else "always")

    def update(self, data: dict) -> dict:
        """按设置页提交更新配置并写回 .env；apiKey 留空 = 保持原值。"""
        p = data.get("provider")
        if p in ALL_PROVIDERS:
            self._set_env("AI_PROVIDER", p)
        if "baseUrl" in data:
            self._set_env("AI_BASE_URL", str(data["baseUrl"]).strip())
        key = str(data.get("apiKey") or "").strip()
        if key:
            self._set_env("AI_API_KEY", key)
        if data.get("chatModel"):
            self._set_env("AI_CHAT_MODEL", str(data["chatModel"]).strip())
        if data.get("embeddingProvider") in ("local_transformers", "openai", "none"):
            self._set_env("AI_EMBEDDING_PROVIDER", data["embeddingProvider"])
        if data.get("embeddingUrl") is not None:
            self._set_env("AI_EMBEDDING_URL", str(data["embeddingUrl"]).strip())
        if data.get("embeddingModel"):
            self._set_env("AI_EMBEDDING_MODEL", str(data["embeddingModel"]).strip())
        if data.get("currency") in CURRENCIES:
            self._set_env("AI_CURRENCY", data["currency"])
        if "prices" in data and isinstance(data["prices"], dict):
            self._set_env("AI_MODEL_PRICES", json.dumps(data["prices"], ensure_ascii=False))
        self.reload()
        return self.to_public()
