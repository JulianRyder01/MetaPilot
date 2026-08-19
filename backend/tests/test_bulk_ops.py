"""集合/文档 复制 / 移动 / 批量删除 测试（/api/bulk/* 与 store 层新方法）。"""
import tempfile
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app
from app.plugins.base import manager
from app.storage.progress import ProgressStore
from app.storage.stats import StatsStore
from app.storage.store import LibraryStore

client = TestClient(app)


def _reset():
    tmp = Path(tempfile.mkdtemp(prefix="metapilot_bulk_"))
    manager.configure(tmp)
    app.state.store = LibraryStore(tmp)
    app.state.progress = ProgressStore(tmp)
    app.state.stats = StatsStore(tmp)


def setup_function():
    _reset()


def _lib(name: str):
    return client.post("/api/libraries", json={"name": name}).json()


def _course(lid: str, name: str = "数学课"):
    return client.post(
        f"/api/libraries/{lid}/folders", json={"name": name, "kind": "course"}
    ).json()


def _doc(fid: str, name: str = "导论", folder_id: str = ""):
    return client.post(
        f"/api/folders/{fid}/documents",
        json={"name": name, "docType": "study", "folderId": folder_id},
    ).json()


def test_duplicate_folder_deep_copy():
    a, b = _lib("库A"), _lib("库B")
    course = _course(a["id"])
    sub = client.post(
        f"/api/folders/{course['id']}/folders", json={"name": "第一章", "parentId": ""}
    ).json()
    doc = _doc(course["id"], folder_id=sub["id"])
    sec = client.post(f"/api/documents/{doc['id']}/sections", json={"name": "点1"}).json()
    client.post(f"/api/sections/{sec['id']}/blocks", json={"type": "markdown", "content": "hi"})

    r = client.post("/api/bulk/duplicate", json={"topFolderIds": [course["id"]], "nameSuffix": "（副本）"})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["copied"] == 1
    dup = data["items"][0]
    assert dup["id"] != course["id"]
    assert dup["name"] == "数学课（副本）"
    assert dup["documents"][0]["id"] != doc["id"]
    assert dup["documents"][0]["sections"][0]["blocks"][0]["content"] == "hi"
    # 副本出现在同库
    lib = client.get(f"/api/libraries/{a['id']}").json()
    assert len([f for f in lib["folders"] if f["id"] == dup["id"]]) == 1


def test_duplicate_document_and_subfolder():
    lid = _lib("库A")["id"]
    course = _course(lid)
    sub = client.post(
        f"/api/folders/{course['id']}/folders", json={"name": "第一章", "parentId": ""}
    ).json()
    doc = _doc(course["id"], folder_id=sub["id"])

    r = client.post("/api/bulk/duplicate", json={"subFolderIds": [sub["id"]], "documentIds": [doc["id"]], "nameSuffix": "（副本）"})
    assert r.status_code == 200
    data = r.json()
    assert data["copied"] == 2
    # 嵌套文件夹副本保持父级与子树引用
    sub_copy = next(x for x in data["items"] if "kind" not in x)
    assert sub_copy["id"] != sub["id"]
    assert sub_copy["parentId"] == sub["parentId"]


def test_move_folder_across_libraries():
    a, b = _lib("库A"), _lib("库B")
    course = _course(a["id"])
    r = client.post("/api/bulk/move", json={"topFolderIds": [course["id"]], "targetLibraryId": b["id"]})
    assert r.status_code == 200, r.text
    assert r.json()["moved"] == 1
    la = client.get(f"/api/libraries/{a['id']}").json()
    lb = client.get(f"/api/libraries/{b['id']}").json()
    assert not any(f["id"] == course["id"] for f in la["folders"])
    assert any(f["id"] == course["id"] for f in lb["folders"])
    # 顶层集合移动到同库应 400
    r2 = client.post("/api/bulk/move", json={"topFolderIds": [course["id"]], "targetLibraryId": b["id"]})
    assert r2.status_code == 400


def test_move_document_within_and_across_library():
    a, b = _lib("库A"), _lib("库B")
    course_a = _course(a["id"])
    course_b = _course(b["id"], "英语课")
    doc = _doc(course_a["id"], folder_id="")
    # 同库库内移动：A 的 course_a 根 → A 的 course_b 根（此时 course_b 在 B，跨库目标）
    r = client.post(
        "/api/bulk/move",
        json={"documentIds": [doc["id"]], "targetLibraryId": b["id"], "targetFolderId": course_b["id"]},
    )
    assert r.status_code == 200
    lb = client.get(f"/api/libraries/{b['id']}").json()
    target = next(f for f in lb["folders"] if f["id"] == course_b["id"])
    assert any(d["id"] == doc["id"] for d in target["documents"])
    la = client.get(f"/api/libraries/{a['id']}").json()
    src = next(f for f in la["folders"] if f["id"] == course_a["id"])
    assert not any(d["id"] == doc["id"] for d in src["documents"])


def test_bulk_delete():
    a = _lib("库A")
    course = _course(a["id"])
    sub = client.post(
        f"/api/folders/{course['id']}/folders", json={"name": "第一章", "parentId": ""}
    ).json()
    doc1 = _doc(course["id"], folder_id=sub["id"])
    doc2 = _doc(course["id"], folder_id=sub["id"])
    r = client.post("/api/bulk/delete", json={"subFolderIds": [sub["id"]], "documentIds": [doc1["id"]], "topFolderIds": [course["id"]]})
    assert r.status_code == 200
    assert r.json()["deleted"] >= 2  # 文档 + 子文件夹被级联删除
    lib = client.get(f"/api/libraries/{a['id']}").json()
    assert lib["folders"] == []