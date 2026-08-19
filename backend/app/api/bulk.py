"""集合/文档批量操作路由（删除 / 创建副本 / 移动）。

「我的库」卡片与文件管理器的右键菜单、批量选择模式统一走这三个端点。
对象分三类：
- topFolderIds  顶层集合（课程/笔记/图表/纯目录文件夹，跨库移动）
- subFolderIds  顶层集合内的嵌套文件夹（可库内换父或跨库挪到目标顶层文件夹下）
- documentIds   文档（可库内换文件夹或跨库挪到目标顶层文件夹下）
"""
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from ..storage.store import LibraryStore

router = APIRouter(prefix="/api", tags=["bulk"])


def _store(request: Request) -> LibraryStore:
    return request.app.state.store


def _http(e: Exception) -> HTTPException:
    """KeyError → 404（对象不存在）；ValueError → 400（语义错误，如顶层集合移动到同库）。"""
    if isinstance(e, KeyError):
        return HTTPException(status_code=404, detail=str(e))
    return HTTPException(status_code=400, detail=str(e))


class BulkRefs(BaseModel):
    topFolderIds: list[str] = Field(default_factory=list)
    subFolderIds: list[str] = Field(default_factory=list)
    documentIds: list[str] = Field(default_factory=list)


class BulkDuplicateIn(BulkRefs):
    """创建副本：nameSuffix 追加到新对象名称后（如「（副本）」，由前端按语言传入）。"""
    nameSuffix: str = ""


class BulkMoveIn(BulkRefs):
    """移动：文档/嵌套文件夹 → targetFolderId 目标顶层文件夹（targetParentId 可指定其下嵌套目录，空=根级）；顶层集合 → 目标库根。"""
    targetLibraryId: str = Field(min_length=1)
    targetFolderId: str = ""
    targetParentId: str = ""


@router.post("/bulk/delete")
def bulk_delete(body: BulkRefs, request: Request):
    try:
        return _store(request).bulk_delete(body.topFolderIds, body.subFolderIds, body.documentIds)
    except Exception as e:  # noqa: BLE001
        raise _http(e)


@router.post("/bulk/duplicate")
def bulk_duplicate(body: BulkDuplicateIn, request: Request):
    try:
        return _store(request).bulk_duplicate(
            body.topFolderIds, body.subFolderIds, body.documentIds, body.nameSuffix
        )
    except Exception as e:  # noqa: BLE001
        raise _http(e)


@router.post("/bulk/move")
def bulk_move(body: BulkMoveIn, request: Request):
    try:
        # 文档/嵌套文件夹移动必须指定目标顶层文件夹（否则无法确定落位）
        if (body.subFolderIds or body.documentIds) and not body.targetFolderId:
            raise HTTPException(status_code=400, detail="文档/嵌套文件夹移动需要指定目标顶层文件夹 (targetFolderId)")
        return _store(request).bulk_move(
            body.targetLibraryId,
            body.topFolderIds,
            body.subFolderIds,
            body.documentIds,
            body.targetFolderId,
            body.targetParentId,
        )
    except Exception as e:  # noqa: BLE001
        raise _http(e)