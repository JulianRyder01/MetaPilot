"""Markdown / Obsidian 笔记导入（核心：文档库阅读器能力，不属于课程插件）。"""
from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile

router = APIRouter(prefix="/api/plugins/notes", tags=["notes"])


@router.post("/import")
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
