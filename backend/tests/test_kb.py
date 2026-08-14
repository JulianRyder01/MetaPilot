"""个人知识库插件测试：多数据源（默认库 / 软链接挂载）索引、检索、问答溯源。"""
import tempfile
from pathlib import Path

from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from app.plugins.base import manager
from app.storage.progress import ProgressStore
from app.storage.stats import StatsStore
from app.storage.store import LibraryStore
from plugins.knowledge_base.service import KBService

# 测试环境不自动拉起真实 embedding 服务进程
settings.embedding_auto_start = False

client = TestClient(app)


class FakeEmbedding:
    """文本前缀决定向量：傅里叶/第一个→e0，卷积/第二个→e1，其他→e2；问题→e0。"""

    def __init__(self):
        self.provider = "fake"
        self.url = "fake"
        self.model = "Qwen/Qwen3-Embedding-0.6B"
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


class FakeSymlink:
    """软链接插件服务的测试替身。"""

    def __init__(self, mounts: list[dict]):
        self._mounts = mounts

    def list_mounts(self):
        return self._mounts

    def get_mount(self, mount_id: str):
        for m in self._mounts:
            if m["id"] == mount_id:
                return m
        raise KeyError(f"挂载不存在: {mount_id}")


def _reset():
    tmp = Path(tempfile.mkdtemp(prefix="metapilot_kb_"))
    manager.configure(tmp)
    app.state.store = LibraryStore(tmp)
    app.state.progress = ProgressStore(tmp)
    app.state.stats = StatsStore(tmp)
    app.state.kb = KBService(app.state.store, tmp / "kb", FakeEmbedding())
    app.state.symlink = None


def setup_function():
    _reset()


def _make_library():
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
    return {"lib": lib, "col": col, "doc": doc, "s1": s1, "s2": s2}


def _make_symlink_dir() -> tuple[Path, str]:
    root = Path(tempfile.mkdtemp(prefix="metapilot_kb_sym_"))
    (root / "a.md").write_text(
        "# 第一个知识点 傅里叶变换\n\n傅里叶变换把信号从时域变到频域。\n\n## 子标题甲\n\n补充内容甲。",
        encoding="utf-8",
    )
    (root / "b.txt").write_text("第二个知识点 卷积：加权叠加。", encoding="utf-8")
    return root, "mount1"


def test_plugins_list():
    r = client.get("/api/plugins")
    assert r.status_code == 200
    ids = [p["id"] for p in r.json()]
    assert "knowledge_base" in ids
    assert "course" in ids


def test_sources_list_library_and_symlink():
    t = _make_library()
    root, mid = _make_symlink_dir()
    app.state.symlink = FakeSymlink([{"id": mid, "name": "我的笔记", "root": str(root), "type": "dir"}])
    app.state.kb.symlink = app.state.symlink

    r = client.get("/api/plugins/knowledge_base/sources")
    assert r.status_code == 200
    sources = r.json()
    libs = [s for s in sources if s["type"] == "library"]
    syms = [s for s in sources if s["type"] == "symlink"]
    assert any(s["id"] == t["lib"]["id"] for s in libs)
    assert any(s["id"] == mid and s["name"] == "我的笔记" for s in syms)
    for s in sources:
        assert s["status"]["indexed"] is False


def test_sources_exclude_symlink_when_plugin_disabled():
    """禁用软链接插件后，个人知识库不再列出软链接数据源（软链接支持不写死）。"""
    t = _make_library()
    root, mid = _make_symlink_dir()
    app.state.symlink = FakeSymlink([{"id": mid, "name": "我的笔记", "root": str(root), "type": "dir"}])
    app.state.kb.symlink = app.state.symlink

    # 默认启用：软链接源可见
    r = client.get("/api/plugins/knowledge_base/sources").json()
    assert any(s["type"] == "symlink" for s in r)

    # 禁用软链接插件后：软链接源消失，默认库源保留
    client.post("/api/plugins/symlink/disable")
    try:
        r = client.get("/api/plugins/knowledge_base/sources")
        assert r.status_code == 200
        sources = r.json()
        assert all(s["type"] != "symlink" for s in sources)
        assert any(s["type"] == "library" and s["id"] == t["lib"]["id"] for s in sources)
    finally:
        client.post("/api/plugins/symlink/enable")

    # 重新启用后：软链接源恢复
    r = client.get("/api/plugins/knowledge_base/sources").json()
    assert any(s["type"] == "symlink" for s in r)


def test_index_library_source_and_status():
    t = _make_library()
    lib_id = t["lib"]["id"]
    key = f"library_{lib_id}"

    st = client.get(f"/api/plugins/knowledge_base/index/{key}/status").json()
    assert st["indexed"] is False

    r = client.post("/api/plugins/knowledge_base/index", json={
        "sources": [{"type": "library", "id": lib_id}],
    })
    assert r.status_code == 200, r.text
    result = r.json()["results"][0]
    assert result["indexed"] is True
    assert result["sectionCount"] == 2
    assert result["vectorDim"] == 4

    st = client.get(f"/api/plugins/knowledge_base/index/{key}/status").json()
    assert st["indexed"] is True
    assert st["sectionCount"] == 2


def test_index_symlink_source_splits_by_heading():
    root, mid = _make_symlink_dir()
    app.state.symlink = FakeSymlink([{"id": mid, "name": "我的笔记", "root": str(root), "type": "dir"}])
    app.state.kb.symlink = app.state.symlink

    r = client.post("/api/plugins/knowledge_base/index", json={
        "sources": [{"type": "symlink", "id": mid}],
    })
    assert r.status_code == 200, r.text
    result = r.json()["results"][0]
    assert result["indexed"] is True
    # a.md：# 标题 + ## 子标题 两段；b.txt：无标题整文件一段
    assert result["sectionCount"] == 3


def test_ask_multi_source(monkeypatch):
    t = _make_library()
    root, mid = _make_symlink_dir()
    app.state.symlink = FakeSymlink([{"id": mid, "name": "我的笔记", "root": str(root), "type": "dir"}])
    app.state.kb.symlink = app.state.symlink

    lib_key = f"library_{t['lib']['id']}"
    sym_key = f"symlink_{mid}"
    client.post("/api/plugins/knowledge_base/index", json={
        "sources": [{"type": "library", "id": t["lib"]["id"]},
                    {"type": "symlink", "id": mid}],
    })

    captured = {}

    async def fake_chat(messages, **kwargs):
        captured["prompt"] = messages[0]["content"]
        return "根据[来源1]，傅里叶变换将信号从时域转换到频域。\n引用来源：[来源1]"

    monkeypatch.setattr("plugins.knowledge_base.service.chat_completion", fake_chat)

    r = client.post("/api/plugins/knowledge_base/ask", json={
        "sources": [{"type": "library", "id": t["lib"]["id"]},
                    {"type": "symlink", "id": mid}],
        "question": "问题：什么是傅里叶变换？",
    })
    assert r.status_code == 200, r.text
    result = r.json()
    assert "傅里叶" in result["answer"]
    assert "[来源1]" in captured["prompt"]
    assert "问题：什么是傅里叶变换" in captured["prompt"]
    # 多源合并检索：top1 命中库的「第一个知识点」（向量均为 e0，先索引的库排前）
    assert result["sources"][0]["sectionId"] == t["s1"]["id"]
    assert result["sources"][0]["link"]["kind"] == "learn"
    assert result["sources"][0]["score"] >= result["sources"][1]["score"]
    # 来源里应包含软链接文件段
    assert any(s["link"]["kind"] == "symlink" for s in result["sources"][:2])


def test_ask_without_index_returns_400():
    t = _make_library()
    r = client.post("/api/plugins/knowledge_base/ask", json={
        "sources": [{"type": "library", "id": t["lib"]["id"]}],
        "question": "问题",
    })
    assert r.status_code == 400
    assert "索引" in r.json()["detail"]


def test_embedding_status_models_and_health():
    r = client.get("/api/plugins/knowledge_base/embedding-status")
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["healthy"] is True
    assert "Qwen/Qwen3-Embedding-0.6B" in data["models"]
    assert "Qwen/Qwen3-Embedding-4B" in data["models"]
    assert data["model"] == "Qwen/Qwen3-Embedding-0.6B"


def test_embedding_start_rejects_unknown_model():
    r = client.post("/api/plugins/knowledge_base/embedding/start", json={"model": "nope/model"})
    assert r.status_code == 400


