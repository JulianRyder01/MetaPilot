"""文档（章节）、小节（知识点）、块（组件流）路由。"""
from fastapi import APIRouter, HTTPException, Request

from ..schemas import BlockIn, DocumentIn, ReorderIn, SectionIn
from ..storage.store import LibraryStore

router = APIRouter(prefix="/api", tags=["content"])


def _store(request: Request) -> LibraryStore:
    return request.app.state.store


def _not_found(e: KeyError):
    raise HTTPException(status_code=404, detail=str(e))


def _doc_payload(body: DocumentIn) -> dict:
    # by_alias=True：输出 docType / folderId（与后端存储字段一致）
    return body.model_dump(exclude_unset=True, by_alias=True)


@router.post("/folders/{fid}/documents")
def create_document(fid: str, body: DocumentIn, request: Request):
    try:
        return _store(request).create_document(fid, _doc_payload(body))
    except KeyError as e:
        _not_found(e)


@router.post("/collections/{cid}/documents")
def create_document_alias(cid: str, body: DocumentIn, request: Request):
    """旧路径别名（/api/collections → /api/folders）。"""
    return create_document(cid, body, request)


@router.put("/documents/{did}")
def update_document(did: str, body: DocumentIn, request: Request):
    try:
        return _store(request).update_document(did, _doc_payload(body))
    except KeyError as e:
        _not_found(e)


@router.delete("/documents/{did}")
def delete_document(did: str, request: Request):
    try:
        _store(request).delete_document(did)
        return {"ok": True}
    except KeyError as e:
        _not_found(e)


@router.post("/documents/{did}/sections")
def create_section(did: str, body: SectionIn, request: Request):
    try:
        return _store(request).create_section(
            did, body.model_dump(exclude_unset=True, by_alias=True)
        )
    except KeyError as e:
        _not_found(e)


@router.post("/documents/{did}/sections/reorder")
def reorder_sections(did: str, body: ReorderIn, request: Request):
    try:
        return _store(request).reorder_sections(did, body.ids)
    except KeyError as e:
        _not_found(e)


@router.put("/sections/{sid}")
def update_section(sid: str, body: dict, request: Request):
    try:
        return _store(request).update_section(sid, body)
    except KeyError as e:
        _not_found(e)


@router.delete("/sections/{sid}")
def delete_section(sid: str, request: Request):
    try:
        _store(request).delete_section(sid)
        return {"ok": True}
    except KeyError as e:
        _not_found(e)


@router.post("/sections/{sid}/blocks")
def add_block(sid: str, body: BlockIn, request: Request):
    try:
        return _store(request).add_block(sid, body.model_dump(exclude_unset=True, exclude_none=True))
    except KeyError as e:
        _not_found(e)


@router.post("/sections/{sid}/blocks/reorder")
def reorder_blocks(sid: str, body: ReorderIn, request: Request):
    try:
        return _store(request).reorder_blocks(sid, body.ids)
    except KeyError as e:
        _not_found(e)


@router.put("/blocks/{bid}")
def update_block(bid: str, body: BlockIn, request: Request):
    try:
        return _store(request).update_block(bid, body.model_dump(exclude_unset=True, exclude_none=True))
    except KeyError as e:
        _not_found(e)


@router.delete("/blocks/{bid}")
def delete_block(bid: str, request: Request):
    try:
        _store(request).delete_block(bid)
        return {"ok": True}
    except KeyError as e:
        _not_found(e)
