"""AI 统一网关：所有插件经此调用 AI，MetaPilot 中转，插件拿不到 api-key / api-endpoint。

- chat：openai 兼容（含 minimax/custom） / anthropic（/v1/messages 转换） / local（内置本地 LLM）
- embed：local_transformers（内置下载）/ openai 兼容
- rerank：内置本地重排服务
- 每次调用记录用量（token / 次数 / 成本）到 AIUsageStore，供「统计」页展示；
  成本按模型单价表（每百万 token：缓存命中 / 输入 / 输出，货币 $ 或 ¥）计算。
"""
from __future__ import annotations

import asyncio
from datetime import datetime
from pathlib import Path
from typing import Optional

import httpx

from ..config import settings
from .ai_config import AIConfig
from ..storage.ai_usage import AIUsageStore


class AIError(RuntimeError):
    """AI 调用失败（上层按 502/503 映射）。"""


class NotConfiguredError(AIError):
    """AI 服务未配置（provider=none 或缺 key）。"""


class AIGateway:
    def __init__(self, data_dir: Path, config: Optional[AIConfig] = None,
                 usage: Optional[AIUsageStore] = None):
        self.data_dir = Path(data_dir)
        self.config = config or AIConfig()
        self.usage = usage or AIUsageStore(self.data_dir)

    # ---------------- 成本 ----------------

    def _cost(self, model: str, input_tokens: int, cached_tokens: int, output_tokens: int) -> tuple[float, str]:
        """按单价表计算成本（每百万 token），返回 (cost, currency)；无价格表时 cost=0 且不记 currency。"""
        price = self.config.price_for(model)
        if not price:
            return 0.0, ""
        per_m = 1_000_000
        in_price = float(price.get("input") or 0)
        cached_price = float(price.get("cachedInput") or 0)
        out_price = float(price.get("output") or 0)
        cost = ((input_tokens - cached_tokens) * in_price + cached_tokens * cached_price
                + output_tokens * out_price) / per_m
        return round(cost, 8), str(price.get("currency") or self.config.currency)

    def _record(self, plugin: str, model: str, provider: str,
                input_tokens: int, cached_tokens: int, output_tokens: int) -> None:
        cost, currency = self._cost(model, input_tokens, cached_tokens, output_tokens)
        self.usage.add({
            "ts": datetime.now().isoformat(timespec="seconds"),
            "plugin": plugin,
            "model": model,
            "provider": provider,
            "inputTokens": int(input_tokens),
            "cachedTokens": int(cached_tokens),
            "outputTokens": int(output_tokens),
            "cost": cost,
            "currency": currency,
        })

    # ---------------- chat ----------------

    async def chat(self, messages: list[dict], model: str = "", temperature: float = 0.3,
                   max_tokens: int = 1024, response_format: Optional[dict] = None,
                   plugin: str = "core") -> dict:
        """统一 chat 调用，返回 {content, inputTokens, cachedTokens, outputTokens, model, provider}。"""
        provider = self.config.provider
        model = model or self.config.chat_model
        if provider == "none":
            raise NotConfiguredError("AI 服务未配置（AI_PROVIDER=none），请在设置中配置或改用本地模型")

        if provider == "local":
            result = await self._chat_local(messages, model, temperature, max_tokens, response_format)
        elif provider == "anthropic":
            result = await self._chat_anthropic(messages, model, temperature, max_tokens)
        else:
            result = await self._chat_openai(messages, model, temperature, max_tokens, response_format)

        self._record(plugin, result["model"], provider,
                     result["inputTokens"], result["cachedTokens"], result["outputTokens"])
        return result

    async def _chat_openai(self, messages, model, temperature, max_tokens, response_format) -> dict:
        if not self.config.base_url:
            raise NotConfiguredError("AI 服务未配置 API 地址（AI_BASE_URL）")
        if not self.config.api_key:
            raise NotConfiguredError("AI 服务未配置 API Key（AI_API_KEY），请在设置中填写")
        body: dict = {"model": model, "messages": messages,
                      "temperature": temperature, "max_tokens": max_tokens}
        if response_format:
            body["response_format"] = response_format
        url = f"{self.config.base_url.rstrip('/')}/chat/completions"
        try:
            async with httpx.AsyncClient(timeout=120) as client:
                resp = await client.post(url, headers={"Authorization": f"Bearer {self.config.api_key}"}, json=body)
                resp.raise_for_status()
                data = resp.json()
        except httpx.HTTPError as e:
            raise AIError(f"云端 AI 调用失败（{self.config.base_url}）：{e}")
        content = data["choices"][0]["message"]["content"]
        usage = data.get("usage") or {}
        input_tokens = int(usage.get("prompt_tokens") or 0)
        cached_tokens = int((usage.get("prompt_tokens_details") or {}).get("cached_tokens") or 0)
        output_tokens = int(usage.get("completion_tokens") or 0)
        return {"content": content, "inputTokens": input_tokens, "cachedTokens": cached_tokens,
                "outputTokens": output_tokens, "model": data.get("model") or model, "provider": "openai"}

    async def _chat_anthropic(self, messages, model, temperature, max_tokens) -> dict:
        if not self.config.base_url:
            raise NotConfiguredError("AI 服务未配置 API 地址（AI_BASE_URL）")
        if not self.config.api_key:
            raise NotConfiguredError("AI 服务未配置 API Key（AI_API_KEY），请在设置中填写")
        # anthropic 格式：system 单独字段，messages 只含 user/assistant
        system_parts = [m["content"] for m in messages if m.get("role") == "system"]
        conv = [{"role": m["role"], "content": m["content"]}
                for m in messages if m.get("role") in ("user", "assistant")]
        body: dict = {"model": model, "messages": conv, "temperature": temperature, "max_tokens": max_tokens}
        if system_parts:
            body["system"] = "\n\n".join(system_parts)
        base = self.config.base_url.rstrip("/")
        url = f"{base}/v1/messages" if not base.endswith("/v1") else f"{base}/messages"
        try:
            async with httpx.AsyncClient(timeout=120) as client:
                resp = await client.post(url, headers={
                    "x-api-key": self.config.api_key,
                    "anthropic-version": "2023-06-01",
                }, json=body)
                resp.raise_for_status()
                data = resp.json()
        except httpx.HTTPError as e:
            raise AIError(f"Anthropic 调用失败（{base}）：{e}")
        content = "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text")
        usage = data.get("usage") or {}
        input_tokens = int(usage.get("input_tokens") or 0)
        cached_tokens = int(usage.get("cache_read_input_tokens") or 0)
        output_tokens = int(usage.get("output_tokens") or 0)
        return {"content": content, "inputTokens": input_tokens, "cachedTokens": cached_tokens,
                "outputTokens": output_tokens, "model": data.get("model") or model, "provider": "anthropic"}

    async def _chat_local(self, messages, model, temperature, max_tokens, response_format) -> dict:
        url = f"{self.config.local_llm_url.rstrip('/')}/v1/chat/completions"
        body: dict = {"model": model, "messages": messages,
                      "temperature": temperature, "max_tokens": max_tokens}
        if response_format:
            body["response_format"] = response_format
        try:
            async with httpx.AsyncClient(timeout=300) as client:
                resp = await client.post(url, json=body)
                resp.raise_for_status()
                data = resp.json()
        except httpx.HTTPError as e:
            raise AIError(f"本地 LLM 服务不可用（{self.config.local_llm_url}）：{e}。请先在设置中下载并启动内置模型")
        content = data["choices"][0]["message"]["content"]
        usage = data.get("usage") or {}
        return {"content": content,
                "inputTokens": int(usage.get("prompt_tokens") or 0),
                "cachedTokens": 0,
                "outputTokens": int(usage.get("completion_tokens") or 0),
                "model": data.get("model") or model, "provider": "local"}

    # ---------------- embed ----------------

    async def embed(self, texts: list[str], model: str = "", plugin: str = "core") -> list[list[float]]:
        """统一向量化。embedding 独立 provider：local_transformers | openai | none。"""
        if not texts:
            return []
        provider = self.config.embedding_provider
        if provider == "none":
            raise NotConfiguredError("向量服务未配置（AI_EMBEDDING_PROVIDER=none）")
        model = model or self.config.embedding_model
        if provider == "local_transformers":
            try:
                async with httpx.AsyncClient(timeout=180) as client:
                    resp = await client.post(f"{self.config.embedding_url.rstrip('/')}/embed",
                                             json={"texts": texts})
                    resp.raise_for_status()
                    data = resp.json()
            except httpx.HTTPError as e:
                raise AIError(f"本地向量服务不可用（{self.config.embedding_url}）：{e}。请先在设置中下载并启动内置向量模型")
            vectors = data.get("vectors")
            if not vectors:
                raise AIError("向量服务返回空向量")
            return vectors

        # openai 兼容云端 embedding
        if not self.config.base_url or not self.config.api_key:
            raise NotConfiguredError("云端向量服务未配置（API 地址 / Key）")
        try:
            async with httpx.AsyncClient(timeout=180) as client:
                resp = await client.post(
                    f"{self.config.base_url.rstrip('/')}/embeddings",
                    headers={"Authorization": f"Bearer {self.config.api_key}"},
                    json={"model": model, "input": texts},
                )
                resp.raise_for_status()
                data = resp.json()
        except httpx.HTTPError as e:
            raise AIError(f"云端向量调用失败：{e}")
        vectors = [d["embedding"] for d in sorted(data["data"], key=lambda x: x["index"])]
        # 云端 embedding 无 token 明细，仅记调用次数（tokens=0）
        self.usage.add({
            "ts": datetime.now().isoformat(timespec="seconds"),
            "plugin": plugin, "model": model, "provider": "openai",
            "inputTokens": 0, "cachedTokens": 0, "outputTokens": 0, "cost": 0.0, "currency": "",
        })
        return vectors

    # ---------------- rerank ----------------

    async def rerank(self, query: str, documents: list[str], model: str = "",
                     top_k: Optional[int] = None, plugin: str = "core") -> list[dict]:
        """本地重排：返回 [{index, score}] 降序（可选截断 top_k）。"""
        if not documents:
            return []
        try:
            async with httpx.AsyncClient(timeout=180) as client:
                resp = await client.post(
                    f"{self.config.rerank_url.rstrip('/')}/rerank",
                    json={"query": query, "documents": documents, "top_k": top_k,
                          "model": model or self.config.embedding_model},
                )
                resp.raise_for_status()
                data = resp.json()
        except httpx.HTTPError as e:
            raise AIError(f"本地重排服务不可用（{self.config.rerank_url}）：{e}。请先在设置中下载并启动内置重排模型")
        results = data.get("results") or []
        return sorted(results, key=lambda x: -x["score"])

    # ---------------- 统计 ----------------

    def usage_summary(self, range_: str = "all") -> dict:
        return self.usage.summary(range_)
