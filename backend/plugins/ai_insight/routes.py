"""AI 洞察插件路由：资源树、异步索引（带进度）、多模式对话与洞察规划生成。

被禁用时所有端点返回 503 + 启用提示（requires_plugin("ai_insight")）。
未建索引直接提问/规划时返回 409 + code=NOT_INDEXED（前端自动建索引并等待完成后重发）。
"""
from __future__ import annotations

from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from app.config import settings
from app.plugins.base import requires_plugin
from app.services.embedding import EMBEDDING_MODELS, EmbeddingError
from app.services.embedding_server import embedding_server_manager
from .service import InsightService, MODE_PROMPTS, NotIndexedError

router = APIRouter(
    prefix="/api/plugins/ai_insight",
    tags=["ai_insight"],
    dependencies=[Depends(requires_plugin("ai_insight"))],
)


class SourceIn(BaseModel):
    """数据源：library（库）/ collection（文档集）/ document（文档）/ symlink（软链接挂载或挂载内路径）。"""
    type: Literal["library", "collection", "document", "symlink"]
    id: str
    path: str = ""  # symlink 专用：挂载内相对路径（空 = 整个挂载）


class IndexIn(BaseModel):
    sources: list[SourceIn]


class HistoryMsg(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class AskIn(BaseModel):
    sources: list[SourceIn]
    mode: Literal["assist", "wander", "reflect"]
    question: str = Field(min_length=1)
    history: list[HistoryMsg] = []
    topK: int = 5


class PlanIn(BaseModel):
    sources: list[SourceIn]
    question: str = Field(min_length=1)
    output: Literal["canvas", "course"] = "canvas"
    libraryId: str = ""
    topK: int = 12


class ModelIn(BaseModel):
    model: str = ""


def _svc(request: Request) -> InsightService:
    svc: InsightService = request.app.state.ai_insight
    # 软链接插件可能注册在后：路由请求时懒注入；仅当软链接插件启用时才注入，
    # 禁用后不再把本机目录列为数据源（软链接支持不写死）。
    from app.plugins.base import manager

    if manager.is_enabled("symlink"):
        svc.symlink = getattr(request.app.state, "symlink", None)
    else:
        svc.symlink = None
    return svc


def _ensure_auto_start() -> None:
    """插件首次访问：若配置了自动启动且服务未运行，则自动拉起（首次含模型多路下载）。"""
    if settings.embedding_auto_start and not embedding_server_manager.is_running():
        try:
            embedding_server_manager.start()
        except Exception as e:
            print(f"[ai_insight] 自动启动 embedding 服务失败: {e}")


@router.get("/embedding-status")
async def embedding_status(request: Request):
    _ensure_auto_start()
    svc = _svc(request)
    return {
        "provider": svc.embedding.provider,
        "url": svc.embedding.url,
        "model": svc.embedding.model,
        "models": EMBEDDING_MODELS,
        "healthy": await svc.embedding.health(),
        "serverRunning": embedding_server_manager.is_running(),
        "autoStart": settings.embedding_auto_start,
    }


@router.post("/embedding/start")
def embedding_start(body: ModelIn):
    """启动本地 embedding 服务；body.model 可切换 Qwen3 模型（0.6B / 4B），自动多路下载。"""
    model = body.model or settings.embedding_model
    if model not in EMBEDDING_MODELS:
        raise HTTPException(status_code=400, detail=f"不支持的模型: {model}，可选 {list(EMBEDDING_MODELS)}")
    if embedding_server_manager.is_running():
        embedding_server_manager.stop()
    return embedding_server_manager.start(model)


@router.post("/embedding/stop")
def embedding_stop():
    embedding_server_manager.stop()
    return {"ok": True}


@router.get("/resources")
def resources(request: Request):
    """可选择的资源树（库 → 文档集 → 文档；软链接挂载），各节点附索引状态。"""
    return _svc(request).resources()


@router.get("/resources/symlink/{mid}/tree")
def symlink_tree(mid: str, request: Request, path: str = ""):
    """浏览软链接挂载内目录（供前端树形选择挂载内路径）。"""
    try:
        return _svc(request).symlink_tree(mid, path)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/index/{key}/status")
def index_status(key: str, request: Request):
    """某数据源索引状态（含进行中的进度 total/done，供进度条轮询）。"""
    return _svc(request).status(key)


@router.post("/index")
def index(body: IndexIn, request: Request):
    """对选中的多个数据源建立/更新向量索引（后台执行，立即返回本次启动的 key 列表）。"""
    svc = _svc(request)
    try:
        sources = [{"type": s.type, "id": s.id, "path": s.path} for s in body.sources]
        keys = svc.start_index(sources)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"started": keys}


@router.post("/ask")
async def ask(body: AskIn, request: Request):
    """按思考模式对已索引数据源检索并对话；未索引返回 409（前端先建索引）。"""
    svc = _svc(request)
    try:
        sources = [{"type": s.type, "id": s.id, "path": s.path} for s in body.sources]
        history = [{"role": h.role, "content": h.content} for h in body.history]
        return await svc.ask(sources, body.mode, body.question, history, body.topK)
    except NotIndexedError as e:
        raise HTTPException(status_code=409, detail={"code": "NOT_INDEXED", "keys": e.keys})
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except EmbeddingError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"问答失败: {e}")


@router.post("/plan")
async def plan(body: PlanIn, request: Request):
    """洞察规划：多轮 agent 推理，生成图表（canvas）或课程（course）到指定库。"""
    svc = _svc(request)
    try:
        sources = [{"type": s.type, "id": s.id, "path": s.path} for s in body.sources]
        return await svc.plan(sources, body.question, body.output, body.libraryId or None, body.topK)
    except NotIndexedError as e:
        raise HTTPException(status_code=409, detail={"code": "NOT_INDEXED", "keys": e.keys})
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except EmbeddingError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"洞察规划失败: {e}")


@router.get("/modes")
def modes():
    """思考模式清单（展示名由前端词典提供；此处仅返回模式 id 与其用途，动态可扩充）。"""
    return [{"id": m, "description": d.split("。")[0]} for m, d in MODE_PROMPTS.items()]
