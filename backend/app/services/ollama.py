"""Ollama 本地模型集成：本机 ollama 服务的探测、模型管理、对话与向量化。

与既有的「内置本地模型服务」（transformers）互不干扰：ollama 由用户自行安装/启动，
本模块只负责经其原生 HTTP API（默认 http://127.0.0.1:11434）交互：

- 探测：GET /api/tags（服务是否在跑、已拉取哪些模型）；
- 拉取模型：POST /api/pull（流式，直到 success/error）；
- 对话：POST /api/chat（支持 format=json，供结构化输出/工具识别用）；
- 向量：POST /api/embed（ollama 0.5+），失败回退 /api/embeddings（旧版单条）；
- OpenAI 兼容端点：http://<host>:<port>/v1 供 AI 网关作 chat 后端。

本模块不加任何具体模型的硬编码：模型名、服务地址均可配置（默认值来自 AI 配置，
.ENV 可覆盖）。脱敏插件 / AI 洞察插件经 request.app.state.ollama 取用，不重复编写。
"""
from __future__ import annotations

import asyncio
from typing import Optional

import httpx

from .ai_config import AIConfig

DEFAULT_OLLAMA_URL = "http://127.0.0.1:11434"


class OllamaError(RuntimeError):
    """ollama 交互错误（服务未启动 / 模型缺失 / 调用失败）。"""


def _config() -> AIConfig:
    global _ai_config
    if _ai_config is None:
        _ai_config = AIConfig()
    return _ai_config


_ai_config: Optional[AIConfig] = None


class OllamaClient:
    """本机 ollama 客户端（地址与模型均取自 AI 配置，可被 .env 覆盖）。"""

    def __init__(self, url: str = "", llm_model: str = "", embedding_model: str = "",
                 config: Optional[AIConfig] = None):
        cfg = config or _config()
        self.url = (url or cfg.ollama_url).rstrip("/")
        self.llm_model = llm_model or cfg.ollama_model
        self.embedding_model = embedding_model or cfg.ollama_embedding_model

    # ---------------- 探测 ----------------

    async def health(self) -> bool:
        """ollama 服务是否可达（GET /api/tags 200）。"""
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                r = await client.get(f"{self.url}/api/tags")
                return r.status_code == 200
        except Exception:
            return False

    async def list_models(self) -> list[dict]:
        """已拉取的模型清单：[{name, size, modified_at, digest?}]，服务不可达抛 OllamaError。"""
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.get(f"{self.url}/api/tags")
                r.raise_for_status()
                data = r.json()
        except httpx.HTTPError as e:
            raise OllamaError(f"无法连接本机 ollama（{self.url}）：{e}。"
                              "请先安装并启动 ollama（ollama serve），或到插件设置里修改地址")
        models = data.get("models") or []
        return [{"name": m.get("name"), "size": m.get("size", 0),
                 "modified_at": m.get("modified_at", "")} for m in models]

    async def model_ready(self, model: str = "") -> bool:
        """指定模型是否已拉取到本地。"""
        model = model or self.llm_model
        try:
            names = [m["name"] for m in await self.list_models()]
        except OllamaError:
            return False
        return any(n == model or n.rsplit(":", 1)[0] == model.rsplit(":", 1)[0] for n in names)

    # ---------------- 模型管理 ----------------

    async def pull(self, model: str, emit: Optional[callable] = None) -> dict:
        """拉取模型（流式，emit(status) 可接收进度行）；返回 {pulled, model}。

        兼容已带 tag 的模型（如 qwen3.5:4b）与只给族名（qwen3.5 → 用途中列出的最新 tag）。
        """
        model = model or self.llm_model
        name = model if ":" in model else f"{model}:latest"
        try:
            async with httpx.AsyncClient(timeout=None) as client:
                async with client.stream("POST", f"{self.url}/api/pull",
                                         json={"model": name}, timeout=None) as resp:
                    resp.raise_for_status()
                    async for line in resp.aiter_lines():
                        if not line.strip():
                            continue
                        try:
                            import json as _json
                            evt = _json.loads(line)
                        except Exception:
                            continue
                        if emit:
                            await emit(evt)
                        if evt.get("status") == "success":
                            return {"pulled": True, "model": name}
                        if evt.get("error"):
                            raise OllamaError(f"拉取模型失败: {evt.get('error')}")
        except httpx.HTTPError as e:
            raise OllamaError(f"拉取模型失败（{self.url}）：{e}。请确认 ollama 服务已启动")
        raise OllamaError(f"拉取模型 {name} 未完成")

    # ---------------- 对话 ----------------

    async def chat(self, messages: list[dict], model: str = "", temperature: float = 0.2,
                   json_mode: bool = False, max_tokens: Optional[int] = None) -> dict:
        """调用 ollama 对话；json_mode=True 时按 format=json 请求，返回原始 content 字符串。

        返回 {"content", "model", "done", "totalDuration"?}；content 为模型文本输出，
        请求 json_mode 时应能解析为 JSON（是否严格由调用方决定），这里不擅自改动校验。
        """
        model = model or self.llm_model
        body: dict = {"model": model, "messages": messages, "stream": False,
                      "options": {"temperature": temperature}}
        if json_mode:
            body["format"] = "json"
        if max_tokens:
            body.setdefault("options", {})["num_predict"] = max_tokens
        try:
            async with httpx.AsyncClient(timeout=300) as client:
                r = await client.post(f"{self.url}/api/chat", json=body)
                r.raise_for_status()
                data = r.json()
        except httpx.HTTPError as e:
            body_txt = str(getattr(e, "response", None) and getattr(e, "response", None))
            raise OllamaError(f"ollama 对话失败（{model}@{self.url}）：{e} {body_txt}")
        msg = data.get("message") or {}
        content = msg.get("content") or ""
        return {"content": content, "model": data.get("model") or model,
                "done": data.get("done", False)}

    # ---------------- 向量 ----------------

    async def embeddings(self, texts: list[str], model: str = "") -> list[list[float]]:
        """文本向量化：优先 POST /api/embed（ollama 0.5+ 批量），失败回退 /api/embeddings（单条）。"""
        model = model or self.embedding_model
        if not texts:
            return []
        try:
            return await self._embed_new(texts, model)
        except OllamaError:
            return await self._embed_legacy(texts, model)

    async def _embed_new(self, texts: list[str], model: str) -> list[list[float]]:
        try:
            async with httpx.AsyncClient(timeout=180) as client:
                r = await client.post(f"{self.url}/api/embed",
                                      json={"model": model, "input": texts})
                r.raise_for_status()
                data = r.json()
        except httpx.HTTPError as e:
            raise OllamaError(f"ollama 向量化失败（{model}@{self.url}）：{e}")
        vecs = data.get("embeddings")
        if not vecs:
            raise OllamaError(f"ollama 向量服务返回空（{model}）")
        return vecs

    async def _embed_legacy(self, texts: list[str], model: str) -> list[list[float]]:
        out = []
        async with httpx.AsyncClient(timeout=180) as client:
            for t in texts:
                r = await client.post(f"{self.url}/api/embeddings",
                                      json={"model": model, "prompt": t})
                r.raise_for_status()
                data = r.json()
                emb = data.get("embedding")
                if not emb:
                    raise OllamaError(f"ollama 向量服务返回空（{model}）")
                out.append(emb)
        return out

    # ---------------- OpenAI 兼容端点 ----------------

    @property
    def openai_base_url(self) -> str:
        """给 AI 网关作为 chat 后端（/v1/chat/completions）。"""
        return f"{self.url}/v1"


# 模块级单例（由 main.py 装配到 app.state.ollama）
ollama_client = OllamaClient()
