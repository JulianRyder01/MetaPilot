"""个人知识库插件路由（多数据源：默认库 / 软链接挂载；embedding 模型选择与自动启动）。

被禁用时所有端点返回 503 + 启用提示（requires_plugin("knowledge_base")）。
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from app.config import settings
from app.plugins.base import requires_plugin
from app.services.embedding import EMBEDDING_MODELS, EmbeddingError
from app.services.embedding_server import embedding_server_manager

router = APIRouter(
    prefix="/api/plugins/knowledge_base",
    tags=["kb"],
    dependencies=[Depends(requires_plugin("knowledge_base"))],
)


class SourceIn(BaseModel):
    type: str  # library | symlink
    id: str


class IndexIn(BaseModel):
    sources: list[SourceIn]


class AskIn(BaseModel):
    sources: list[SourceIn]
    question: str
    topK: int = 5


class ModelIn(BaseModel):
    model: str = ""


def _kb(request: Request):
    kb = request.app.state.kb
    # 软链接插件可能注册在后：路由请求时懒注入
    if kb.symlink is None:
        kb.symlink = getattr(request.app.state, "symlink", None)
    return kb


def _ensure_auto_start() -> None:
    """插件首次访问：若配置了自动启动且服务未运行，则自动拉起（首次含模型多路下载）。"""
    if settings.embedding_auto_start and not embedding_server_manager.is_running():
        try:
            embedding_server_manager.start()
        except Exception as e:
            print(f"[kb] 自动启动 embedding 服务失败: {e}")


@router.get("/embedding-status")
async def embedding_status(request: Request):
    _ensure_auto_start()
    kb = _kb(request)
    return {
        "provider": kb.embedding.provider,
        "url": kb.embedding.url,
        "model": kb.embedding.model,
        "models": EMBEDDING_MODELS,
        "healthy": await kb.embedding.health(),
        "serverRunning": embedding_server_manager.is_running(),
        "autoStart": settings.embedding_auto_start,
    }


@router.post("/embedding/start")
def embedding_start(body: ModelIn):
    """启动本地 embedding 服务；body.model 可切换 Qwen3 模型（0.6B / 4B），自动多路下载。"""
    model = body.model or settings.embedding_model
    if model not in EMBEDDING_MODELS:
        raise HTTPException(status_code=400, detail=f"不支持的模型: {model}，可选 {list(EMBEDDING_MODELS)}")
    # 切换模型：先停旧进程再以新模型启动
    if embedding_server_manager.is_running():
        embedding_server_manager.stop()
    return embedding_server_manager.start(model)


@router.post("/embedding/stop")
def embedding_stop():
    embedding_server_manager.stop()
    return {"ok": True}


@router.get("/sources")
def kb_sources(request: Request):
    """可用数据源（默认库 + 软链接挂载），附各源索引状态。"""
    return _kb(request).list_sources()


@router.get("/index/{key}/status")
def kb_status(key: str, request: Request):
    try:
        return _kb(request).status(key)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/index")
async def kb_index(body: IndexIn, request: Request):
    """对选中的多个数据源建立/更新向量索引。"""
    kb = _kb(request)
    results = []
    for s in body.sources:
        try:
            results.append(await kb.index_source({"type": s.type, "id": s.id}))
        except KeyError as e:
            raise HTTPException(status_code=404, detail=str(e))
        except EmbeddingError as e:
            raise HTTPException(status_code=503, detail=str(e))
    return {"results": results}


@router.post("/ask")
async def kb_ask(body: AskIn, request: Request):
    """对选中的已索引数据源合并检索并问答（未索引时返回 400 提示先建索引）。"""
    kb = _kb(request)
    try:
        sources = [{"type": s.type, "id": s.id} for s in body.sources]
        return await kb.ask(sources, body.question, body.topK)
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except EmbeddingError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"问答失败: {e}")
