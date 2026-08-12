"""个人知识库插件路由。"""
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from ..services.embedding import EmbeddingError
from ..services.embedding_server import embedding_server_manager

router = APIRouter(prefix="/api/plugins/kb", tags=["kb"])


class AskIn(BaseModel):
    question: str
    topK: int = 5


def _kb(request: Request):
    return request.app.state.kb


@router.get("/embedding-status")
async def embedding_status(request: Request):
    kb = _kb(request)
    return {
        "provider": kb.embedding.provider,
        "url": kb.embedding.url,
        "model": kb.embedding.model,
        "healthy": await kb.embedding.health(),
        "serverRunning": embedding_server_manager.is_running(),
    }


@router.post("/embedding/start")
def embedding_start():
    return embedding_server_manager.start()


@router.post("/embedding/stop")
def embedding_stop():
    embedding_server_manager.stop()
    return {"ok": True}


@router.get("/{cid}/status")
def kb_status(cid: str, request: Request):
    try:
        return _kb(request).status(cid)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/{cid}/index")
async def kb_index(cid: str, request: Request):
    try:
        return await _kb(request).index_collection(cid)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except EmbeddingError as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.post("/{cid}/ask")
async def kb_ask(cid: str, body: AskIn, request: Request):
    try:
        return await _kb(request).ask(cid, body.question, body.topK)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except EmbeddingError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"问答失败: {e}")
