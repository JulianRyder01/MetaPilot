"""核心 ollama 管理 API（前缀 /api/ai/ollama）：状态、模型拉取（后台）、一键应用为 AI 后端。

供 AI 洞察等插件与「设置 → AI 服务」消费：用户可自行填写地址/模型、启动 ollama、拉取模型，
并一键把对话（chat）与向量（embedding）切换到本机 ollama。底层调用 app.state.ollama（OllamaClient）
与 AIConfig（写回 .env），不写死具体模型名——模型名均由配置/请求提供。
"""
from __future__ import annotations

import asyncio
import threading
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app.services.ai_config import AIConfig
from app.services.ollama import OllamaClient, OllamaError

router = APIRouter(prefix="/api/ai/ollama", tags=["ai"])

# 后台拉取状态：model → {status: downloading|done|error, error?}
_pulls: dict[str, dict] = {}


class PullIn(BaseModel):
    model: str = ""


class ApplyIn(BaseModel):
    llmModel: str = ""
    embeddingModel: str = ""


def _ollama(request: Request) -> OllamaClient:
    return request.app.state.ollama


def _gw(request: Request):
    return request.app.state.ai_gateway


def _ready(installed: list[str], model: str) -> bool:
    return model in installed or any(
        m.rsplit(":", 1)[0] == model.rsplit(":", 1)[0] for m in installed
    )


@router.get("/status")
async def status(request: Request):
    """ollama 状态：服务是否在线、已拉取模型、对话/向量模型就绪与否、当前 AI 配置。"""
    o = _ollama(request)
    cfg = _gw(request).config
    healthy = await o.health()
    installed: list[str] = []
    if healthy:
        try:
            installed = [m["name"] for m in await o.list_models()]
        except OllamaError:
            installed = []
    llm = cfg.ollama_model
    emb = cfg.ollama_embedding_model
    return {
        "healthy": healthy,
        "url": o.url,
        "installed": installed,
        "llmModel": llm,
        "embeddingModel": emb,
        "llmReady": _ready(installed, llm),
        "embeddingReady": _ready(installed, emb),
        # 当前 AI 是否已由 ollama 接管（对话 provider / 向量 provider）
        "chatOnOllama": cfg.provider == "ollama",
        "embedOnOllama": cfg.embedding_provider == "ollama",
        "chatProvider": cfg.provider,
        "embedProvider": cfg.embedding_provider,
    }


@router.post("/pull")
def pull(body: PullIn, request: Request):
    """后台拉取模型；同模型已在拉取则直接返回。"""
    o = _ollama(request)
    model = body.model or o.llm_model if body.model else o.llm_model

    def _norm(m: str) -> str:
        return m if ":" in m else f"{m}:latest"

    key = _norm(model)
    if _pulls.get(key, {}).get("status") == "downloading":
        return {"started": True, "message": f"{key} 已在拉取中"}

    async def worker():
        try:
            await o.pull(model)
            _pulls[key] = {"status": "done"}
        except Exception as e:  # noqa: BLE001
            _pulls[key] = {"status": "error", "error": str(e)}

    _pulls[key] = {"status": "downloading"}
    threading.Thread(target=lambda: asyncio.run(worker()), daemon=True).start()
    return {"started": True, "message": f"开始后台拉取 {key}"}


@router.get("/pull/{model}/status")
def pull_status(model: str, request: Request):
    """查询某模型后台拉取进度（downloading / done / error）。"""
    key = model if ":" in model else f"{model}:latest"
    return _pulls.get(key, {"status": "unknown"})


@router.post("/apply")
def apply(body: ApplyIn, request: Request):
    """一键应用为 ollama 后端：要求对话/向量模型均已就绪，然后写回 .env 并切换 provider。

    body 可只填一个（另一个保持当前配置）；未就绪的模型抛 400，提示先「拉取模型」。
    """
    o = _ollama(request)
    cfg = _gw(request).config
    llm = body.llmModel or cfg.ollama_model
    emb = body.embeddingModel or cfg.ollama_embedding_model

    healthy = asyncio.run(o.health())
    if not healthy:
        raise HTTPException(status_code=400, detail="本机 ollama 未运行，请先启动（ollama serve）")
    try:
        installed = [m["name"] for m in asyncio.run(o.list_models())]
    except OllamaError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not _ready(installed, llm):
        raise HTTPException(status_code=400,
                            detail=f"对话模型 {llm} 尚未就绪，请先在 ollama 拉取（或点结果页的「拉取模型」）")
    if not _ready(installed, emb):
        raise HTTPException(status_code=400,
                            detail=f"向量模型 {emb} 尚未就绪，请先在 ollama 拉取")

    cfg.update({
        "provider": "ollama",
        "ollamaUrl": o.url,
        "ollamaModel": llm,
        "embeddingProvider": "ollama",
        "embeddingModel": emb,
        "ollamaEmbeddingModel": emb,
    })
    # 重建客户端使新配置（地址/模型）即时生效
    request.app.state.ollama = OllamaClient(config=cfg)
    return {"ok": True, "chatProvider": "ollama", "embedProvider": "ollama",
            "llmModel": llm, "embeddingModel": emb}
