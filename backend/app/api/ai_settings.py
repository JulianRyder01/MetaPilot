"""核心 AI 配置 API（前缀 /api/ai）：provider 配置（写回 .env）、用量统计、本地模型管理。

- GET/PUT /api/ai/config：读取（key 掩码）/ 更新 AI 统一配置，全部持久化到 .env（不上云）；
- GET /api/ai/usage：AI 用量统计（调用次数 / token / 成本，按模型分组）；
- GET /api/ai/local-models + POST download/start/stop：内置本地模型（向量/对话/重排）管理。
"""
from __future__ import annotations

from typing import Literal, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app.services.ai_gateway import AIError, NotConfiguredError

router = APIRouter(prefix="/api/ai", tags=["ai"])


class ConfigIn(BaseModel):
    provider: Optional[str] = None
    baseUrl: Optional[str] = None
    apiKey: Optional[str] = None  # 留空 = 保持原值
    chatModel: Optional[str] = None
    embeddingProvider: Optional[str] = None
    embeddingUrl: Optional[str] = None
    embeddingModel: Optional[str] = None
    ollamaUrl: Optional[str] = None
    ollamaModel: Optional[str] = None
    ollamaEmbeddingModel: Optional[str] = None
    currency: Optional[str] = None
    prices: Optional[dict] = None


class LocalModelIn(BaseModel):
    kind: Literal["embedding", "llm", "rerank"]
    model: str = ""


def _gw(request: Request):
    return request.app.state.ai_gateway


@router.get("/config")
def get_config(request: Request):
    """当前 AI 配置（key 掩码展示）+ 本地模型清单与状态。"""
    gw = _gw(request)
    pub = gw.config.to_public()
    pub["localModels"] = request.app.state.local_servers.status_all()
    return pub


@router.put("/config")
def put_config(body: ConfigIn, request: Request):
    """更新 AI 配置并写回 .env；apiKey 留空保持原值。"""
    gw = _gw(request)
    try:
        data = {k: v for k, v in body.model_dump().items() if v is not None}
        pub = gw.config.update(data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    pub["localModels"] = request.app.state.local_servers.status_all()
    return pub


@router.get("/usage")
def usage(request: Request, range: str = "all"):
    """AI 用量统计（all|today|week|month）：调用次数 / token / 成本。"""
    return _gw(request).usage_summary(range)


@router.get("/local-models")
def local_models(request: Request):
    """本地模型状态（是否已下载 / 服务是否运行）。"""
    return request.app.state.local_servers.status_all()


@router.post("/local-models/download")
def local_models_download(body: LocalModelIn, request: Request):
    """下载本地模型（后台执行；已缓存/下载中则直接返回）。"""
    try:
        return request.app.state.local_servers.download(body.kind, body.model)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/local-models/start")
def local_models_start(body: LocalModelIn, request: Request):
    """启动本地模型服务（首次需先下载；服务已在运行则复用）。"""
    try:
        return request.app.state.local_servers.start(body.kind, body.model)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/local-models/stop")
def local_models_stop(body: LocalModelIn, request: Request):
    try:
        return request.app.state.local_servers.stop(body.kind)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/test")
async def test(request: Request):
    """连通性测试：用当前配置发起一次最小 chat 调用（计入用量），返回模型与 token。"""
    gw = _gw(request)
    try:
        r = await gw.chat(
            [{"role": "user", "content": "ping"}],
            max_tokens=8, plugin="core",
        )
    except (NotConfiguredError, AIError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"ok": True, "model": r["model"], "provider": r["provider"],
            "inputTokens": r["inputTokens"], "outputTokens": r["outputTokens"]}
