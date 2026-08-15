"""AI 洞察插件路由：资源树、异步索引（带进度）、多模式对话与洞察规划生成。

被禁用时所有端点返回 503 + 启用提示（requires_plugin("ai_insight")）。
未建索引直接提问/规划时返回 409 + code=NOT_INDEXED（前端自动建索引并等待完成后重发）。
核心 1.1.1 起：AI 调用（对话/向量）统一经 app.state.ai_gateway 中转（密钥/地址不出核心并统计用量），
本地向量服务启停走 app.state.local_servers。
"""
from __future__ import annotations

from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from app.plugins.base import requires_plugin
from app.services.ai_gateway import AIError, NotConfiguredError
from .service import InsightService, MODE_PROMPTS, NotIndexedError

router = APIRouter(
    prefix="/api/plugins/ai_insight",
    tags=["ai_insight"],
    dependencies=[Depends(requires_plugin("ai_insight"))],
)


class SourceIn(BaseModel):
    """数据源：library（库）/ collection（文档集）/ document（文档）/ 挂载类源（由提供方能力定义，如 symlink）。"""
    type: str
    id: str
    path: str = ""  # 挂载类源专用：挂载内相对路径（空 = 整个挂载）


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
    # AI 统一网关：核心 1.1.1 起注入（测试可预置替身，优先保留）
    if svc.gateway is None:
        svc.gateway = getattr(request.app.state, "ai_gateway", None)
    # 挂载类数据源（symlink）由「软链接」插件的能力提供：经能力注册表取服务对象，
    # 不写死插件 id 也不直接读 app.state.symlink；能力不可用（插件禁用）时为 None。
    from app.plugins.base import manager

    svc.symlink = manager.service_for_capability("symlink.mounts")
    return svc


def _ensure_auto_start(request: Request) -> None:
    """插件首次访问：本地向量服务未运行且配置为本地时自动拉起（首次含模型多路下载）。"""
    gw = getattr(request.app.state, "ai_gateway", None)
    if gw is None:
        return
    if gw.config.embedding_provider == "local_transformers":
        try:
            request.app.state.local_servers.start("embedding", wait_ready=False)
        except Exception as e:
            print(f"[ai_insight] 自动启动向量服务失败: {e}")


@router.get("/embedding-status")
async def embedding_status(request: Request):
    _ensure_auto_start(request)
    svc = _svc(request)
    st = request.app.state.local_servers.status("embedding")
    cfg = svc.gateway.config if svc.gateway is not None else None
    return {
        "provider": cfg.embedding_provider if cfg else "",
        "url": cfg.embedding_url if cfg else "",
        "model": cfg.embedding_model if cfg else "",
        # 模型列表与下载说明来自配置（AI_EMBEDDING_MODELS / AI_EMBEDDING_HINT），可动态变更
        "models": cfg.embedding_models if cfg else {},
        "downloadHint": cfg.embedding_download_hint if cfg else "",
        "healthy": st["running"],
        "serverRunning": st["running"],
        "autoStart": True,
    }


@router.post("/embedding/start")
def embedding_start(body: ModelIn, request: Request):
    """启动本地向量服务；body.model 可切换可选模型（清单来自配置），自动多路下载。"""
    cfg = getattr(request.app.state, "ai_gateway", None).config
    model = body.model or cfg.embedding_model
    if model not in cfg.embedding_models:
        raise HTTPException(status_code=400, detail=f"不支持的模型: {model}，可选 {list(cfg.embedding_models)}")
    return request.app.state.local_servers.start("embedding", model)


@router.post("/embedding/stop")
def embedding_stop(request: Request):
    return request.app.state.local_servers.stop("embedding")


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
    except (NotConfiguredError, AIError) as e:
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
    except (NotConfiguredError, AIError) as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"洞察规划失败: {e}")


@router.get("/modes")
def modes():
    """思考模式清单（展示名由前端词典提供；此处仅返回模式 id 与其用途，动态可扩充）。"""
    return [{"id": m, "description": d.split("。")[0]} for m, d in MODE_PROMPTS.items()]
