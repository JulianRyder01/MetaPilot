"""文件夹 / 嵌套文档 / 小节引用 测试。"""
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
    tmp = Path(tempfile.mkdtemp(prefix="metapilot_folders_"))
    manager.configure(tmp)
    app.state.store = LibraryStore(tmp)
    app.state.progress = ProgressStore(tmp)
    app.state.stats = StatsStore(tmp)


def setup_function():
    _reset()


def _make_col():
    lib = client.post("/api/libraries", json={"name": "库"}).json()
    col = client.post(f"/api/libraries/{lib['id']}/collections",
                      json={"name": "文档集", "kind": "note"}).json()
    return col["id"]


def test_folder_crud_and_nesting():
    cid = _make_col()
    # 创建根文件夹 A
    a = client.post(f"/api/collections/{cid}/folders",
                    json={"name": "文件夹A", "parentId": ""}).json()
    assert a["parentId"] == ""
    # 在 A 下创建子文件夹 B
    b = client.post(f"/api/collections/{cid}/folders",
                    json={"name": "子文件夹B", "parentId": a["id"]}).json()
    assert b["parentId"] == a["id"]
    # 移动 A 到 B 下应被拒绝（防环）
    r = client.put(f"/api/folders/{a['id']}", json={"parentId": b["id"]})
    assert r.status_code == 400
    # 重命名 + 移动 A 到根
    r = client.put(f"/api/folders/{a['id']}", json={"name": "A改名", "parentId": ""}).json()
    assert r["name"] == "A改名"
    assert r["parentId"] == ""

    lib = client.get(f"/api/libraries/{client.get('/api/libraries').json()[0]['id']}").json()
    col = lib["collections"][0]
    assert len(col["folders"]) == 2
    # 未知父文件夹 404
    assert client.post(f"/api/collections/{cid}/folders",
                       json={"name": "x", "parentId": "nope"}).status_code == 404


def test_document_in_folder_and_cascade_delete():
    cid = _make_col()
    a = client.post(f"/api/collections/{cid}/folders", json={"name": "A"}).json()
    b = client.post(f"/api/collections/{cid}/folders",
                    json={"name": "B", "parentId": a["id"]}).json()
    # 文档创建到 B 文件夹
    doc = client.post(f"/api/collections/{cid}/documents",
                      json={"name": "文档1", "docType": "note", "folderId": b["id"]}).json()
    assert doc["folderId"] == b["id"]
    # 移动到根
    client.put(f"/api/documents/{doc['id']}",
               json={"name": "文档1", "docType": "note", "folderId": ""})
    # 再放回 B
    client.put(f"/api/documents/{doc['id']}",
               json={"name": "文档1", "docType": "note", "folderId": b["id"]})
    # 删除 A（级联删除 B 及其中文档）
    client.delete(f"/api/folders/{a['id']}")
    lib = client.get(f"/api/libraries/{client.get('/api/libraries').json()[0]['id']}").json()
    col = lib["collections"][0]
    assert col["folders"] == []
    assert col["documents"] == []


def test_section_reference_other_doc():
    cid = _make_col()
    d1 = client.post(f"/api/collections/{cid}/documents",
                     json={"name": "目标文档", "docType": "note"}).json()
    d2 = client.post(f"/api/collections/{cid}/documents",
                     json={"name": "引用文档", "docType": "note"}).json()
    # 创建引用小节：refDocId 指向 d1
    sec = client.post(f"/api/documents/{d2['id']}/sections",
                      json={"name": "参见目标", "refDocId": d1["id"]}).json()
    assert sec["refDocId"] == d1["id"]
    # 修改小节引用
    client.put(f"/api/sections/{sec['id']}", json={"name": "参见目标", "refDocId": ""})
    got = client.get(f"/api/collections/{cid}").json()
    assert got["documents"][1]["sections"][0]["refDocId"] == ""
    # 普通小节不带 refDocId 字段（默认空）
    plain = client.post(f"/api/documents/{d2['id']}/sections", json={"name": "普通"}).json()
    assert plain.get("refDocId", "") == ""
