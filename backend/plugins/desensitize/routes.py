"""脱敏插件路由：ollama 状态/配置/模型拉取、文本识别与应用、文件（PDF/图片）分析与涂黑。

所有端点挂在 /api/plugins/desensitize/ 下，经 requires_plugin 门禁；被禁用返回 503。
识别/替换/涂黑逻辑都在 service.py 的开放工具集里，路由只做参数校验与错误翻译。
"""
from __future__ import annotations

import json
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field

from app.plugins.base import requires_plugin
from app.services.ai_config import AIConfig
from app.services.ollama import OllamaClient, OllamaError

from .service import DesensitizeService

router = APIRouter(
    prefix="/api/plugins/desensitize",
    tags=["desensitize"],
    dependencies=[Depends(requires_plugin("desensitize"))],
)


class AnalyzeIn(BaseModel):
    text: str = Field(min_length=1)
    model: str = ""


class ApplyIn(BaseModel):
    text: str
    items: list[dict] = []


class ConfigIn(BaseModel):
    url: Optional[str] = None
    model: Optional[str] = None
    embeddingModel: Optional[str] = None


class PullIn(BaseModel):
    model: str = ""


def _svc(request: Request) -> DesensitizeService:
    return request.app.state.desensitize


@router.get("/status")
async def status(request: Request):
    """ollama 服务状态、当前模型、是否就绪、已拉取模型名列表（服务/label 均来自配置，不写死）。"""
    svc = _svc(request)
    healthy = await svc.ollama.health()
    models: list[str] = []
    if healthy:
        try:
            models = [m["name"] for m in await svc.ollama.list_models()]
        except OllamaError:
            models = []
    ready = svc.ollama.llm_model in models or any(
        m.rsplit(":", 1)[0] == svc.ollama.llm_model.rsplit(":", 1)[0] for m in models
    )
    return {
        "ollamaHealthy": healthy,
        "url": svc.ollama.url,
        "model": svc.ollama.llm_model,
        "embeddingModel": svc.ollama.embedding_model,
        "modelReady": ready,
        "modelInstalled": models,
        "provider": svc.config.provider if svc.config else "",
    }


@router.post("/config")
async def config(body: ConfigIn, request: Request):
    """保存 ollama 地址/模型到 .env 并重建客户端（地址/模型均可改，不写死）。"""
    svc = _svc(request)
    data = {k: v for k, v in body.model_dump().items() if v is not None}
    pub = svc.config.update(data) if svc.config else {}
    ollama_cfg = AIConfig()
    svc.ollama = OllamaClient(config=ollama_cfg)
    svc.config = ollama_cfg
    return {"saved": True,
            "url": svc.ollama.url, "model": svc.ollama.llm_model,
            "embeddingModel": svc.ollama.embedding_model}


@router.post("/pull")
async def pull(body: PullIn, request: Request):
    """拉取（下载）本地模型到 ollama，直到完成。"""
    svc = _svc(request)
    model = body.model or svc.ollama.llm_model
    try:
        res = await svc.ollama.pull(model)
    except OllamaError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return res


@router.post("/analyze")
async def analyze(body: AnalyzeIn, request: Request):
    """识别文本中的敏感信息（本地模型输出 JSON，工具定位并标出所有敏感段）。"""
    svc = _svc(request)
    try:
        return await svc.analyze_text(body.text, body.model)
    except OllamaError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/apply")
def apply(body: ApplyIn, request: Request):
    """按用户确认的条目，用黑色块替换文本/markdown 中的敏感内容，返回替换后文本与区间。"""
    svc = _svc(request)
    masked, spans = svc.mask_text(body.text, body.items)
    return {"text": masked, "spans": spans, "masked": len(spans) > 0}


@router.post("/file/analyze")
async def file_analyze(file: UploadFile = File(...), model: str = Form(""), request: Request = None):
    """上传 PDF/图片：提取文本（PDF 用 pymupdf，图片用可选 OCR）→ 本地模型识别敏感信息。"""
    svc = _svc(request)
    data = await file.read()
    name = file.filename or ""
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    try:
        if ext == "pdf":
            ex = svc.extract_pdf_text(data)
        elif ext in ("png", "jpg", "jpeg", "bmp", "webp", "gif"):
            ex = svc.extract_image_text(data)
        else:
            # 未知类型按纯文本尝试解码
            try:
                text = data.decode("utf-8", errors="replace")
            except Exception:
                raise HTTPException(status_code=400, detail=f"不支持的文件类型: {ext or '(无扩展名)'}")
            ex = {"text": text, "kind": "text"}
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if not ex.get("text", "").strip():
        return {"fileName": name, "kind": ex.get("kind"), "text": "", "items": [], "count": 0,
                "ocr": ex.get("ocr", False)}

    res = await svc.analyze_text(ex["text"], model)
    res["fileName"] = name
    res["kind"] = ex.get("kind")
    res["ocr"] = ex.get("ocr", False)
    res["text"] = ex["text"][:20000]
    return res


@router.post("/file/redact")
async def file_redact(file: UploadFile = File(...), payload: str = Form("..."), request: Request = None):
    """对上传文件涂黑：payload 为 JSON 字符串，{items:[{value...}]} 或 {full:true}/{regions:[[x0,y0,x1,y1]]}。

    已确认的 items 会在文件里按 value 定位并涂成黑块；图片支持 full（整图涂黑）与 regions（矩形）。
    """
    svc = _svc(request)
    data = await file.read()
    name = file.filename or ""
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    try:
        p = json.loads(payload)
    except Exception:
        raise HTTPException(status_code=400, detail="payload 不是合法 JSON")
    items = p.get("items") or []
    values = [str(i.get("value") or "").strip() for i in items if i.get("value")]

    try:
        if ext == "pdf":
            out = svc.redact_pdf(data, values)
            media = "application/pdf"
            fname = f"{name.rsplit('.', 1)[0]}_redacted.pdf"
        elif ext in ("png", "jpg", "jpeg", "bmp", "webp", "gif"):
            regions = p.get("regions")
            full = bool(p.get("full"))
            out = svc.redact_image(data, regions=regions, full=full)
            media = "image/png" if ext in ("jpg", "jpeg") else f"image/{ext}"
            fname = f"{name.rsplit('.', 1)[0]}_redacted.png" if ext in ("jpg", "jpeg") else f"{name.rsplit('.', 1)[0]}_redacted.{ext}"
        else:
            raise HTTPException(status_code=400, detail=f"仅支持 PDF/图片涂黑，拿到 {ext or '(无扩展名)'}")
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return Response(content=out, media_type=media,
                    headers={"Content-Disposition": f'attachment; filename="{fname}"'})
