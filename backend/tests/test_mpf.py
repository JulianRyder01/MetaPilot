"""MetaPilot 文件（.mpf）格式核心测试：序列化/解析/类型分发/未解析项/存储迁移。"""
import json
import tempfile
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app
from app.plugins.base import manager
from app.services import mpf as mpf_service
from app.storage.progress import ProgressStore
from app.storage.stats import StatsStore
from app.storage.store import LibraryStore

client = TestClient(app)


def _reset():
    tmp = Path(tempfile.mkdtemp(prefix="metapilot_mpf_"))
    manager.configure(tmp)
    app.state.store = LibraryStore(tmp)
    app.state.progress = ProgressStore(tmp)
    app.state.stats = StatsStore(tmp)


def setup_function():
    _reset()


def doc_payload() -> dict:
    return {
        "format": "meta-pilot", "formatVersion": 1, "type": "doc",
        "name": "示例课程", "description": "d", "author": "MetaPilot", "version": "1.0.0",
        "collections": [
            {
                "name": "课程", "kind": "course", "description": "",
                "documents": [
                    {
                        "name": "第1章", "docType": "study",
                        "sections": [
                            {"name": "小节1", "blocks": [
                                {"type": "markdown", "content": "# hi"},
                                {"type": "single_choice", "question": "q", "options": ["a"], "answer": 0},
                                {"type": "interactive", "file": "interactives/x.html"},
                            ]},
                        ],
                    }
                ],
            }
        ],
    }


def test_serialize_parse_doc_roundtrip():
    text = mpf_service.serialize_mpf(doc_payload())
    parsed = mpf_service.parse_mpf(text)
    assert parsed["ok"] is True
    assert parsed["type"] == "doc"
    assert parsed["meta"]["name"] == "示例课程"
    assert len(parsed["content"]["folders"][0]["documents"][0]["sections"][0]["blocks"]) == 3
    # 未解析项：single_choice 与 interactive 需要课程插件
    plugins = {u["blockType"] for u in parsed["unresolved"]}
    assert "single_choice" in plugins
    assert "interactive" in plugins
    assert all(u["requiredPlugin"] == "course" for u in parsed["unresolved"])


def test_parse_canvas():
    text = mpf_service.serialize_mpf({
        "type": "canvas", "name": "思维导图",
        "canvas": {
            "nodes": [
                {"id": "n1", "type": "text", "x": 10, "y": 10, "width": 200, "height": 80, "text": "# 主题"},
                {"id": "n2", "type": "file", "x": 300, "y": 10, "width": 200, "height": 80, "file": "docs/a.md"},
            ],
            "edges": [{"id": "e1", "fromNode": "n1", "toNode": "n2", "label": "link"}],
        },
    })
    parsed = mpf_service.parse_mpf(text)
    assert parsed["ok"] is True
    assert parsed["type"] == "canvas"
    assert len(parsed["content"]["nodes"]) == 2
    assert len(parsed["content"]["edges"]) == 1
    assert parsed["unresolved"] == []


def test_parse_invalid():
    # 非 MetaPilot 文件
    assert mpf_service.parse_mpf('{"hello": 1}')["ok"] is False
    # 未知类型
    r = mpf_service.parse_mpf(json.dumps({"format": "meta-pilot", "formatVersion": 1, "type": "nope"}))
    assert r["ok"] is False
    assert "未知的 .mpf 类型" in r["errors"][0]
    # canvas 缺字段
    r = mpf_service.parse_mpf(json.dumps({"format": "meta-pilot", "formatVersion": 1, "type": "canvas", "canvas": {}}))
    assert r["ok"] is False


def test_storage_migrates_old_json_to_mpf():
    # 写入一个旧 .json 库文件，验证读取时自动迁移为 .mpf
    lib = client.post("/api/libraries", json={"name": "旧库"}).json()
    libs_dir = app.state.store.libs_dir
    mpf_path = libs_dir / f"{lib['id']}.mpf"
    # 删除 .mpf，伪造旧 .json
    mpf_path.unlink()
    old_json = libs_dir / f"{lib['id']}.json"
    old_json.write_text(json.dumps({
        "id": lib["id"], "name": "旧库", "description": "", "collections": [],
    }, ensure_ascii=False), encoding="utf-8")

    got = client.get(f"/api/libraries/{lib['id']}").json()
    assert got["name"] == "旧库"
    # 已迁移为 .mpf（.json 被替换）
    assert mpf_path.exists()
    content = mpf_path.read_text(encoding="utf-8")
    assert '"format": "meta-pilot"' in content
    assert '"type": "doc"' in content


def test_mpf_types_list():
    types = {t["type"] for t in mpf_service.list_mpf_types()}
    assert "doc" in types
    assert "canvas" in types
