"""AI 洞察插件测试：资源树、多粒度索引（库/文档集/文档/软链接路径）、异步进度、
多模式对话（辅助思考/思维漫游/反思归纳）与洞察规划生成（画布/课程）。"""
import asyncio
import hashlib
import json
import tempfile
import time
from pathlib import Path

from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from app.plugins.base import manager
from app.storage.progress import ProgressStore
from app.storage.stats import StatsStore
from app.storage.store import LibraryStore
from plugins.ai_insight.service import InsightService

# 测试环境不自动拉起真实 embedding 服务进程
settings.embedding_auto_start = False

client = TestClient(app)


class FakeGateway:
    """AI 统一网关测试替身：embed 按文本前缀给向量；chat 走 replies 队列并捕获 messages。

    - embed：傅里叶/第一个→e0，卷积/第二个→e1，其他→e2；问题→e0（与旧 FakeEmbedding 一致）
    - chat：无 replies 时返回固定回答；有 replies 时依次弹出
    """

    def __init__(self):
        self.replies: list[str] = []
        self.captured: dict = {}
        self.config = type("C", (), {
            "embedding_provider": "local_transformers",
            "embedding_url": "http://127.0.0.1:8760",
            "embedding_model": "Qwen/Qwen3-Embedding-0.6B",
            "embedding_models": {
                "Qwen/Qwen3-Embedding-0.6B": "Qwen3-Embedding-0.6B（轻量，默认）",
                "Qwen/Qwen3-Embedding-4B": "Qwen3-Embedding-4B（更强，需更多显存）",
            },
            "embedding_download_hint": "模型下载多路自动尝试，首次下载需等待模型就绪，页面会自动刷新状态。",
        })()

    async def embed(self, texts, model="", plugin="core"):
        out = []
        for t in texts:
            if t.startswith("问题"):
                out.append([1.0, 0.0, 0.0, 0.0])
            elif "第一个" in t or "傅里叶" in t:
                out.append([1.0, 0.0, 0.0, 0.0])
            elif "第二个" in t or "卷积" in t:
                out.append([0.0, 1.0, 0.0, 0.0])
            else:
                out.append([0.0, 0.0, 1.0, 0.0])
        return out

    async def chat(self, messages, temperature=0.3, max_tokens=1024, response_format=None, plugin="core"):
        self.captured.setdefault("messages", []).append(messages)
        content = self.replies.pop(0) if self.replies else \
            "根据[来源1]，傅里叶变换将信号从时域转换到频域。\n引用来源：[来源1]"
        return {"content": content, "inputTokens": 1, "cachedTokens": 0,
                "outputTokens": 1, "model": "fake", "provider": "fake"}


class FakeSymlink:
    """软链接插件服务的测试替身（含目录浏览）。"""

    def __init__(self, mounts: list[dict]):
        self._mounts = mounts

    def list_mounts(self):
        return self._mounts

    def get_mount(self, mount_id: str):
        for m in self._mounts:
            if m["id"] == mount_id:
                return m
        raise KeyError(f"挂载不存在: {mount_id}")

    def list_dir(self, mount_id: str, rel: str = ""):
        m = self.get_mount(mount_id)
        root = Path(m["root"])
        rel = (rel or "").strip().replace("\\", "/").strip("/")
        target = root if not rel else (root / rel)
        if not target.exists() or not target.is_dir():
            return {"path": rel, "items": []}
        items = []
        for p in sorted(target.iterdir()):
            items.append({
                "name": p.name, "type": "dir" if p.is_dir() else "file",
                "size": p.stat().st_size if p.is_file() else 0,
                "mtime": int(p.stat().st_mtime),
            })
        return {"path": rel, "items": items}


def _reset():
    tmp = Path(tempfile.mkdtemp(prefix="metapilot_insight_"))
    manager.configure(tmp)
    app.state.store = LibraryStore(tmp)
    app.state.progress = ProgressStore(tmp)
    app.state.stats = StatsStore(tmp)
    global GW
    GW = FakeGateway()
    app.state.ai_insight = InsightService(app.state.store, tmp / "ai_insight", gateway=GW)
    app.state.symlink = None
    # 挂载源服务经能力注册表注入（与生产一致：ai_insight 经 capability 取用，不读 app.state）
    manager._services.pop("symlink.mounts", None)


# 当前测试的网关替身（_reset 重建）
GW: FakeGateway = FakeGateway()


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
    root = Path(tempfile.mkdtemp(prefix="metapilot_insight_sym_"))
    (root / "a.md").write_text(
        "# 第一个知识点 傅里叶变换\n\n傅里叶变换把信号从时域变到频域。\n\n## 子标题甲\n\n补充内容甲。",
        encoding="utf-8",
    )
    (root / "b.txt").write_text("第二个知识点 卷积：加权叠加。", encoding="utf-8")
    sub = root / "notes"
    sub.mkdir()
    (sub / "c.md").write_text("# 第三个知识点 采样\n\n采样定理的直觉。", encoding="utf-8")
    return root, "mount1"


def _wait_indexed(keys: list[str], timeout: float = 10.0) -> None:
    """轮询等待后台索引任务完成。"""
    deadline = time.time() + timeout
    while time.time() < deadline:
        if all(not client.get(f"/api/plugins/ai_insight/index/{k}/status").json().get("running")
               for k in keys):
            return
        time.sleep(0.05)
    raise AssertionError(f"索引任务超时未完成: {keys}")


def test_plugins_list_contains_ai_insight():
    r = client.get("/api/plugins")
    assert r.status_code == 200
    ids = [p["id"] for p in r.json()]
    assert "ai_insight" in ids
    assert "knowledge_base" not in ids  # 旧插件已移除


def test_resources_tree_library_and_symlink():
    t = _make_library()
    root, mid = _make_symlink_dir()
    manager.register_service("symlink.mounts", FakeSymlink([{"id": mid, "name": "我的笔记", "root": str(root), "type": "dir"}]))

    r = client.get("/api/plugins/ai_insight/resources")
    assert r.status_code == 200
    tree = r.json()
    libs = tree["libraries"]
    assert any(l["id"] == t["lib"]["id"] and l["collections"][0]["documents"] for l in libs)
    syms = tree["symlinks"]
    assert any(s["id"] == mid and s["name"] == "我的笔记" for s in syms)
    # 各粒度节点都有索引状态
    lib = next(l for l in libs if l["id"] == t["lib"]["id"])
    assert lib["status"]["indexed"] is False
    assert lib["collections"][0]["status"]["indexed"] is False
    assert lib["collections"][0]["documents"][0]["status"]["indexed"] is False


def test_resources_exclude_symlink_when_plugin_disabled():
    t = _make_library()
    root, mid = _make_symlink_dir()
    manager.register_service("symlink.mounts", FakeSymlink([{"id": mid, "name": "我的笔记", "root": str(root), "type": "dir"}]))

    r = client.get("/api/plugins/ai_insight/resources").json()
    assert any(s["type"] == "dir" for s in r["symlinks"])

    client.post("/api/plugins/symlink/disable")
    try:
        r = client.get("/api/plugins/ai_insight/resources").json()
        assert r["symlinks"] == []
        assert any(l["id"] == t["lib"]["id"] for l in r["libraries"])
    finally:
        client.post("/api/plugins/symlink/enable")


def test_symlink_tree_browse():
    root, mid = _make_symlink_dir()
    manager.register_service("symlink.mounts", FakeSymlink([{"id": mid, "name": "我的笔记", "root": str(root), "type": "dir"}]))

    r = client.get(f"/api/plugins/ai_insight/resources/symlink/{mid}/tree")
    assert r.status_code == 200
    names = [i["name"] for i in r.json()["items"]]
    assert "a.md" in names and "notes" in names

    r = client.get(f"/api/plugins/ai_insight/resources/symlink/{mid}/tree", params={"path": "notes"})
    assert r.status_code == 200
    assert [i["name"] for i in r.json()["items"]] == ["c.md"]


def test_index_granularity_library_collection_document():
    t = _make_library()
    lib_id, col_id, doc_id = t["lib"]["id"], t["col"]["id"], t["doc"]["id"]

    # 文档粒度：1 个小节
    client.post("/api/plugins/ai_insight/index", json={
        "sources": [{"type": "document", "id": doc_id}],
    })
    _wait_indexed([f"doc_{doc_id}"])
    st = client.get(f"/api/plugins/ai_insight/index/doc_{doc_id}/status").json()
    assert st["indexed"] is True and st["sectionCount"] == 2

    # 文档集粒度：2 个小节
    client.post("/api/plugins/ai_insight/index", json={
        "sources": [{"type": "collection", "id": col_id}],
    })
    _wait_indexed([f"col_{col_id}"])
    assert client.get(f"/api/plugins/ai_insight/index/col_{col_id}/status").json()["sectionCount"] == 2

    # 库粒度：2 个小节（本库只有该文档集）
    client.post("/api/plugins/ai_insight/index", json={
        "sources": [{"type": "library", "id": lib_id}],
    })
    _wait_indexed([f"lib_{lib_id}"])
    assert client.get(f"/api/plugins/ai_insight/index/lib_{lib_id}/status").json()["sectionCount"] == 2


def test_index_symlink_mount_and_inner_path():
    root, mid = _make_symlink_dir()
    manager.register_service("symlink.mounts", FakeSymlink([{"id": mid, "name": "我的笔记", "root": str(root), "type": "dir"}]))

    # 整个挂载：a.md 两段 + b.txt 一段 + notes/c.md 一段
    client.post("/api/plugins/ai_insight/index", json={
        "sources": [{"type": "symlink", "id": mid, "path": ""}],
    })
    _wait_indexed([f"sym_{mid}"])
    assert client.get(f"/api/plugins/ai_insight/index/sym_{mid}/status").json()["sectionCount"] == 4

    # 挂载内子目录：仅 notes/c.md 一段
    notes_key = "sym_" + mid + "_" + hashlib.md5(b"notes").hexdigest()[:8]
    client.post("/api/plugins/ai_insight/index", json={
        "sources": [{"type": "symlink", "id": mid, "path": "notes"}],
    })
    _wait_indexed([notes_key])
    assert client.get(f"/api/plugins/ai_insight/index/{notes_key}/status").json()["sectionCount"] == 1

    # 路径穿越被拒绝
    r = client.post("/api/plugins/ai_insight/index", json={
        "sources": [{"type": "symlink", "id": mid, "path": "../outside"}],
    })
    assert r.status_code == 400


def test_index_progress_reported_while_running():
    t = _make_library()
    key = f"lib_{t['lib']['id']}"
    # 放慢 embed，确保第二次提交时任务仍在进行中
    orig_embed = GW.embed

    async def slow_embed(texts, model="", plugin="core"):
        await asyncio.sleep(0.3)
        return await orig_embed(texts)

    GW.embed = slow_embed

    r = client.post("/api/plugins/ai_insight/index", json={
        "sources": [{"type": "library", "id": t["lib"]["id"]}],
    })
    assert r.status_code == 200
    assert key in r.json()["started"]

    # 同 key 重复提交不重复启动
    r2 = client.post("/api/plugins/ai_insight/index", json={
        "sources": [{"type": "library", "id": t["lib"]["id"]}],
    })
    assert key not in r2.json()["started"]

    _wait_indexed([key])
    st = client.get(f"/api/plugins/ai_insight/index/{key}/status").json()
    assert st["indexed"] is True
    assert "running" not in st


def test_ask_modes_and_history():
    t = _make_library()
    key = f"lib_{t['lib']['id']}"
    client.post("/api/plugins/ai_insight/index", json={
        "sources": [{"type": "library", "id": t["lib"]["id"]}],
    })
    _wait_indexed([key])

    GW.captured.clear()

    r = client.post("/api/plugins/ai_insight/ask", json={
        "sources": [{"type": "library", "id": t["lib"]["id"]}],
        "mode": "assist",
        "question": "问题：什么是傅里叶变换？",
        "history": [{"role": "user", "content": "上一轮问题"}, {"role": "assistant", "content": "上一轮回答"}],
    })
    assert r.status_code == 200, r.text
    result = r.json()
    assert "傅里叶" in result["answer"]
    assert result["sources"][0]["sectionId"] == t["s1"]["id"]
    assert result["sources"][0]["link"]["kind"] == "learn"

    msgs = GW.captured["messages"][-1]  # 最近一次 chat 的 messages
    assert msgs[0]["role"] == "system"
    assert "分析它们之间的联系" in msgs[0]["content"]  # assist 模式
    # 多轮历史原样透传（位于 system 与最新问题之间）
    assert any(m["content"] == "上一轮问题" for m in msgs)
    assert any(m["content"] == "上一轮回答" for m in msgs)
    # 最新问题携带检索上下文
    assert "[来源1]" in msgs[-1]["content"]
    assert "问题：什么是傅里叶变换" in msgs[-1]["content"]


def test_ask_mode_prompt_differs():
    t = _make_library()
    client.post("/api/plugins/ai_insight/index", json={
        "sources": [{"type": "library", "id": t["lib"]["id"]}],
    })
    _wait_indexed([f"lib_{t['lib']['id']}"])

    GW.captured.clear()

    for mode in ("assist", "wander", "reflect"):
        r = client.post("/api/plugins/ai_insight/ask", json={
            "sources": [{"type": "library", "id": t["lib"]["id"]}],
            "mode": mode,
            "question": "问题",
        })
        assert r.status_code == 200, r.text

    prompts = [m[0]["content"] for m in GW.captured["messages"]]
    assert len(prompts) == 3
    assert prompts[0] != prompts[1]
    assert prompts[1] != prompts[2]
    assert "思维漫游" in prompts[1]
    assert "没有注意到" in prompts[2]


def test_ask_not_indexed_returns_409():
    t = _make_library()
    r = client.post("/api/plugins/ai_insight/ask", json={
        "sources": [{"type": "library", "id": t["lib"]["id"]}],
        "mode": "assist",
        "question": "问题",
    })
    assert r.status_code == 409
    detail = r.json()["detail"]
    assert detail["code"] == "NOT_INDEXED"
    assert f"lib_{t['lib']['id']}" in detail["keys"]


def test_plan_generates_canvas():
    t = _make_library()
    client.post("/api/plugins/ai_insight/index", json={
        "sources": [{"type": "library", "id": t["lib"]["id"]}],
    })
    _wait_indexed([f"lib_{t['lib']['id']}"])

    GW.captured.clear()
    GW.replies = [
        json.dumps({
            "theme": "时域与频域的联系",
            "summary": "傅里叶变换与卷积共同构成信号处理的核心。",
            "keyPoints": ["傅里叶变换", "卷积"],
            "relations": [{"a": "傅里叶变换", "b": "卷积", "relation": "互为工具"}],
            "outline": ["时域", "频域"],
        }, ensure_ascii=False),
        json.dumps({"revisions": [], "extraPoints": ["采样"]}, ensure_ascii=False),
        json.dumps({
            "name": "信号处理概念图",
            "nodes": [
                {"id": "n1", "type": "text", "x": 100, "y": 100, "width": 240, "height": 90,
                 "text": "傅里叶变换", "color": "#3b82f6"},
                {"id": "n2", "type": "text", "x": 600, "y": 100, "width": 240, "height": 90,
                 "text": "卷积"},
                {"id": "bad", "type": "weird", "text": "非法类型"},  # 应被清洗为 text
            ],
            "edges": [
                {"id": "e1", "fromNode": "n1", "toNode": "n2", "label": "联系", "toEnd": "arrow"},
                {"id": "e2", "fromNode": "n1", "toNode": "missing"},  # 应被丢弃
            ],
        }, ensure_ascii=False),
    ]

    r = client.post("/api/plugins/ai_insight/plan", json={
        "sources": [{"type": "library", "id": t["lib"]["id"]}],
        "question": "梳理信号处理的核心概念关系",
        "output": "canvas",
    })
    assert r.status_code == 200, r.text
    result = r.json()
    assert result["kind"] == "canvas"
    assert result["collectionName"] == "信号处理概念图"

    col = client.get(f"/api/collections/{result['collectionId']}").json()
    assert col["kind"] == "canvas"
    nodes, edges = col["canvas"]["nodes"], col["canvas"]["edges"]
    assert len(nodes) == 3  # 含清洗后的 text 节点
    assert nodes[2]["type"] == "text"
    assert len(edges) == 1  # 悬空边被丢弃
    assert edges[0]["fromNode"] == "n1" and edges[0]["toNode"] == "n2"
    # 三轮 agent 调用
    assert len(GW.captured["messages"]) == 3


def test_plan_generates_course():
    t = _make_library()
    client.post("/api/plugins/ai_insight/index", json={
        "sources": [{"type": "library", "id": t["lib"]["id"]}],
    })
    _wait_indexed([f"lib_{t['lib']['id']}"])

    GW.captured.clear()
    GW.replies = [
        json.dumps({"theme": "信号处理入门", "summary": "s",
                    "keyPoints": [], "relations": [], "outline": ["时域", "频域"]},
                   ensure_ascii=False),
        json.dumps({"revisions": [], "extraPoints": []}, ensure_ascii=False),
        json.dumps({
            "name": "信号处理微课",
            "description": "从时域到频域",
            "documents": [
                {"name": "第1章 时域", "docType": "study", "sections": [
                    {"name": "傅里叶变换", "blocks": [
                        {"type": "markdown", "content": "# 傅里叶变换\n\n把信号从时域变到频域。"},
                        {"type": "single_choice", "question": "非法块"},  # 应被丢弃
                    ]},
                ]},
            ],
        }, ensure_ascii=False),
    ]

    r = client.post("/api/plugins/ai_insight/plan", json={
        "sources": [{"type": "library", "id": t["lib"]["id"]}],
        "question": "生成信号处理入门课程",
        "output": "course",
        "libraryId": t["lib"]["id"],
    })
    assert r.status_code == 200, r.text
    result = r.json()
    assert result["kind"] == "course"

    col = client.get(f"/api/collections/{result['collectionId']}").json()
    assert col["kind"] == "course"
    assert col["documents"][0]["name"] == "第1章 时域"
    blocks = col["documents"][0]["sections"][0]["blocks"]
    assert len(blocks) == 1  # 非 markdown 块被丢弃
    assert blocks[0]["type"] == "markdown"


def test_plan_not_indexed_returns_409():
    t = _make_library()
    r = client.post("/api/plugins/ai_insight/plan", json={
        "sources": [{"type": "library", "id": t["lib"]["id"]}],
        "question": "生成图表",
        "output": "canvas",
    })
    assert r.status_code == 409
    assert r.json()["detail"]["code"] == "NOT_INDEXED"


def test_plan_stream_emits_roadmap_events():
    """/plan/stream 按执行路线逐步推送：retrieve/plan/review/generate/save 的 start/done、
    各轮 AI 思考（think）与最终 done(result)。"""
    t = _make_library()
    client.post("/api/plugins/ai_insight/index", json={
        "sources": [{"type": "library", "id": t["lib"]["id"]}],
    })
    _wait_indexed([f"lib_{t['lib']['id']}"])

    GW.captured.clear()
    GW.replies = [
        json.dumps({
            "theme": "时域与频域的联系",
            "summary": "傅里叶变换与卷积共同构成信号处理的核心。",
            "keyPoints": ["傅里叶变换", "卷积"],
            "relations": [],
            "outline": ["时域", "频域"],
        }, ensure_ascii=False),
        json.dumps({"revisions": [], "extraPoints": ["采样"]}, ensure_ascii=False),
        json.dumps({
            "name": "信号处理概念图",
            "nodes": [{"id": "n1", "type": "text", "x": 100, "y": 100, "width": 240, "height": 90,
                       "text": "傅里叶变换"}],
            "edges": [],
        }, ensure_ascii=False),
    ]

    events: list[dict] = []
    with client.stream("POST", "/api/plugins/ai_insight/plan/stream", json={
        "sources": [{"type": "library", "id": t["lib"]["id"]}],
        "question": "梳理信号处理的核心概念关系",
        "output": "canvas",
    }) as r:
        assert r.status_code == 200, r.text
        assert r.headers["content-type"].startswith("text/event-stream")
        for line in r.iter_lines():
            if line.startswith("data:"):
                events.append(json.loads(line[5:].strip()))

    # 步骤按固定顺序交替 start/done（每步两个事件）
    steps = [e for e in events if e["type"] == "step"]
    expected_steps = [s for s in ["retrieve", "plan", "review", "generate", "save"] for _ in range(2)]
    assert [s["step"] for s in steps] == expected_steps
    assert [s["status"] for s in steps] == ["start", "done"] * 5

    # 三轮 AI 思考输出（plan/review/generate），内容与替身回复一致
    thinks = [e for e in events if e["type"] == "think"]
    assert [th["step"] for th in thinks] == ["plan", "review", "generate"]
    assert "时域与频域的联系" in thinks[0]["content"]

    # 最终 done 携带创建结果
    done = [e for e in events if e["type"] == "done"]
    assert len(done) == 1
    assert done[0]["result"]["kind"] == "canvas"
    assert done[0]["result"]["collectionName"] == "信号处理概念图"
    assert not [e for e in events if e["type"] == "error"]


def test_embedding_status_models_and_health(monkeypatch):
    # healthy 来自本地向量服务运行状态；测试环境探测不到服务 → False（结构字段仍完整）
    monkeypatch.setattr(
        "app.services.local_servers.LocalServersManager._port_alive", lambda self, url: False,
    )
    r = client.get("/api/plugins/ai_insight/embedding-status")
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["healthy"] is False
    assert data["provider"] == "local_transformers"
    assert "Qwen/Qwen3-Embedding-0.6B" in data["models"]
    assert "Qwen/Qwen3-Embedding-4B" in data["models"]
    assert data["model"] == "Qwen/Qwen3-Embedding-0.6B"
    # 下载说明由配置下发（前端不写死），结构必须存在
    assert data["downloadHint"]
    assert "自动刷新" in data["downloadHint"]


def test_embedding_start_rejects_unknown_model():
    r = client.post("/api/plugins/ai_insight/embedding/start", json={"model": "nope/model"})
    assert r.status_code == 400
