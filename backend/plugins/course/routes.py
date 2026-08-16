"""课程插件：课程包导入 / 导出、Markdown 笔记导入、文档集转课程（课程插件路由）。

被禁用时所有端点返回 503 + 启用提示（requires_plugin("course")）。
"""
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import Response

from app.plugins.base import requires_plugin
from app.storage.store import find_collection, now_iso

router = APIRouter(
    prefix="/api/plugins",
    tags=["course"],
    dependencies=[Depends(requires_plugin("course"))],
)


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


@router.post("/course/collections/{cid}/convert")
def convert_collection_to_course(cid: str, request: Request):
    """把文档类集合（笔记/知识库等）转为课程。

    课程 = 打了补丁的文档：数据仍是 库-文档集-文档-小节（doc 结构），
    仅补丁 kind=course 与转换标记（convertedFrom/convertedAt）等 key-value；
    未加载/禁用课程插件时课程补丁能力（进度/判题/交互块）不可用，前端按插件门禁提示。
    """
    store = request.app.state.store
    for it in store.list_libraries():
        col = find_collection(store.get_library(it["id"]), cid)
        if col is None:
            continue
        if col.get("kind") == "canvas":
            raise HTTPException(status_code=400, detail="图表不能转为课程")
        if col.get("kind") == "course":
            raise HTTPException(status_code=400, detail="该文档集已经是课程")
        updated = store.update_collection(cid, {
            "kind": "course",
            "convertedFrom": col.get("kind") or "note",
            "convertedAt": now_iso(),
        })
        return {"ok": True, "collection": updated}
    raise HTTPException(status_code=404, detail=f"文档集不存在: {cid}")
