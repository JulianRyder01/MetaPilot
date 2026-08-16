"""MetaPilot 文件（.mpf）路由：导入（.mpf / .canvas 自动转换）与导出。

.mpf 是系统底层统一格式：doc 类型解析为课程/库，canvas 类型解析为图表。
导入属于官方核心能力（无插件门禁）；含课程专属块（题目/交互块）时返回 unresolved，
前端按「插件警告/报错」设置提示，无法渲染的块按现有占位机制展示。
"""
import json

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import Response

from ..services import mpf as mpf_service

router = APIRouter(prefix="/api/mpf", tags=["mpf"])


@router.post("/import")
async def mpf_import(
    request: Request,
    file: UploadFile = File(...),
    libraryId: str = Form(""),
):
    importer = request.app.state.importer
    raw = (await file.read()).decode("utf-8", errors="replace")
    try:
        # .mpf 直接解析；.canvas（JSON Canvas，无 format 头）自动转换为 .mpf
        parsed = mpf_service.parse_mpf(raw)
        if not parsed["ok"] and "format 应为 meta-pilot" in parsed["errors"][0]:
            try:
                canvas_data = json.loads(raw)
            except json.JSONDecodeError:
                canvas_data = None
            if canvas_data and ("nodes" in canvas_data or "edges" in canvas_data):
                raw = importer.canvas_json_to_mpf(canvas_data, name=(file.filename or "").rsplit(".", 1)[0])
        result = importer.import_mpf(raw, library_id=libraryId or "")
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"导入失败: {e}")


@router.get("/libraries/{lid}/export-mpf")
def export_library_mpf(lid: str, request: Request):
    importer = request.app.state.importer
    try:
        text = importer.export_library_mpf(lid)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return _mpf_response(text, "library")


@router.get("/folders/{fid}/export-mpf")
def export_folder_mpf(fid: str, request: Request):
    importer = request.app.state.importer
    try:
        text = importer.export_collection_mpf(fid)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return _mpf_response(text, "folder")


@router.get("/collections/{cid}/export-mpf")
def export_collection_mpf_alias(cid: str, request: Request):
    """旧路径别名（/api/collections → /api/folders）。"""
    return export_folder_mpf(cid, request)


def _mpf_response(text: str, kind: str):
    return Response(
        content=text,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{kind}-{__import__("time").strftime("%Y%m%d%H%M%S")}.mpf"'},
    )
