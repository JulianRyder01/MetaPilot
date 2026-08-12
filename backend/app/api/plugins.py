"""课程插件路由：课程包导入 / 导出。"""
from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import Response

from ..plugins.base import list_plugins

router = APIRouter(prefix="/api/plugins", tags=["plugins"])


@router.get("")
def plugin_list():
    return list_plugins()


@router.post("/course/import")
async def import_course(
    request: Request,
    file: UploadFile = File(...),
    libraryId: str = Form(""),
):
    importer = request.app.state.importer
    data = await file.read()
    try:
        return importer.import_zip_bytes(data, library_id=libraryId or "")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"导入失败: {e}")


@router.get("/course/{cid}/export")
def export_course(cid: str, request: Request):
    importer = request.app.state.importer
    try:
        content = importer.export_collection(cid)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return Response(
        content=content,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="course-{cid}.zip"'},
    )


@router.post("/notes/import")
async def import_note(
    request: Request,
    file: UploadFile = File(...),
    libraryId: str = Form(""),
    collectionId: str = Form(""),
):
    importer = request.app.state.importer
    text = (await file.read()).decode("utf-8", errors="replace")
    try:
        return importer.import_markdown(
            text,
            filename=file.filename or "未命名.md",
            library_id=libraryId or "",
            collection_id=collectionId or "",
        )
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
