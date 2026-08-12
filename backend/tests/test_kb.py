"""个人知识库插件测试：用确定性假 embedding 验证索引、检索、问答溯源。"""
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.plugins.base import manager
from app.storage.progress import ProgressStore
from app.storage.stats import StatsStore
from app.storage.store import LibraryStore
from plugins.knowledge_base.service import KBService

client = TestClient(app)


class FakeEmbedding:
    """section 文本 → 交替向量；query 文本前缀"问题" → 命中第一个 section。"""

    def __init__(self):
        self.provider = "fake"
        self.url = "fake"
        self.model = "fake"
        self.indexed_texts: list[str] = []

    async def health(self):
        return True

    async def embed(self, texts):
        out = []
        for t in texts:
            self.indexed_texts.append(t)
            if t.startswith("问题"):
                out.append([1.0, 0.0, 0.0, 0.0])
            elif "第一个" in t or "傅里叶" in t:
                out.append([1.0, 0.0, 0.0, 0.0])
            elif "第二个" in t or "卷积" in t:
                out.append([0.0, 1.0, 0.0, 0.0])
            else:
                out.append([0.0, 0.0, 1.0, 0.0])
        return out


def _reset():
    tmp = Path(tempfile.mkdtemp(prefix="metapilot_kb_"))
    manager.configure(tmp)
    app.state.store = LibraryStore(tmp)
    app.state.progress = ProgressStore(tmp)
    app.state.stats = StatsStore(tmp)
    app.state.kb = KBService(app.state.store, tmp / "kb", FakeEmbedding())


def setup_function():
    _reset()


def _make_course():
    lib = client.post("/api/libraries", json={"name": "专业库"}).json()
    col = client.post(f"/api/libraries/{lib['id']}/collections",
                      json={"name": "信号与系统", "kind": "course"}).json()
    doc = client.post(f"/api/collections/{col['id']}/documents",
                      json={"name": "第1章", "docType": "study"}).json()
    s1 = client.post(f"/api/documents/{doc['id']}/sections",
                     json={"name": "第一个知识点 傅里叶变换"}).json()
    s2 = client.post(f"/api/documents/{doc['id']}/sections",
                     json={"name": "第二个知识点 卷积"}).json()
    client.post(f"/api/sections/{s1['id']}/blocks",
                json={"type": "markdown", "content": "傅里叶变换把信号从时域变到频域。"})
    client.post(f"/api/sections/{s2['id']}/blocks",
                json={"type": "markdown", "content": "卷积是两个函数的加权叠加。"})
    return {"col": col, "doc": doc, "s1": s1, "s2": s2}


def test_plugins_list():
    r = client.get("/api/plugins")
    assert r.status_code == 200
    ids = [p["id"] for p in r.json()]
    assert "knowledge_base" in ids
    assert "course" in ids


def test_index_and_status():
    t = _make_course()
    cid = t["col"]["id"]
    st = client.get(f"/api/plugins/kb/{cid}/status").json()
    assert st["indexed"] is False

    r = client.post(f"/api/plugins/kb/{cid}/index").json()
    assert r["indexed"] is True
    assert r["sectionCount"] == 2
    assert r["vectorDim"] == 4

    st = client.get(f"/api/plugins/kb/{cid}/status").json()
    assert st["indexed"] is True
    assert st["sectionCount"] == 2


def test_ask_with_sources(monkeypatch):
    t = _make_course()
    cid = t["col"]["id"]
    client.post(f"/api/plugins/kb/{cid}/index")

    captured = {}

    async def fake_chat(messages, **kwargs):
        captured["prompt"] = messages[0]["content"]
        return "根据[来源1]，傅里叶变换将信号从时域转换到频域。\n引用来源：[来源1]"

    monkeypatch.setattr("plugins.knowledge_base.service.chat_completion", fake_chat)

    r = client.post(f"/api/plugins/kb/{cid}/ask", json={"question": "问题：什么是傅里叶变换？"})
    assert r.status_code == 200, r.text
    result = r.json()
    assert "傅里叶" in result["answer"]
    assert "[来源1]" in captured["prompt"]
    assert "问题：什么是傅里叶变换" in captured["prompt"]
    # 溯源：top1 应为第一个知识点
    assert result["sources"][0]["sectionId"] == t["s1"]["id"]
    assert result["sources"][0]["docName"] == "第1章"
    assert result["sources"][0]["score"] > result["sources"][1]["score"]


def test_ask_without_index_returns_400():
    t = _make_course()
    r = client.post(f"/api/plugins/kb/{t['col']['id']}/ask", json={"question": "问题"})
    assert r.status_code == 400
