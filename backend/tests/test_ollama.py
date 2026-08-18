"""核心 ollama 管理 API 测试（/api/ai/ollama）：状态、拉取、一键挂载。

用 FakeOllama 替换 app.state.ollama（不真正联网）；apply 会写 .env，故用 DummyConfig
替换 ai_gateway.config（update 只记录、不落盘），避免污染开发环境配置。
"""
import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


class DummyConfig:
    """假 AI 配置：ollama 字段就绪，update 仅记录不写盘。"""

    url = "http://127.0.0.1:11434"
    ollama_url = "http://127.0.0.1:11434"
    ollama_model = "qwen3.5:4b"
    ollama_embedding_model = "nomic-embed-text"
    llm_model = "qwen3.5:4b"
    embedding_model = "nomic-embed-text"
    provider = "openai"
    embedding_provider = "local_transformers"
    updated: dict = {}

    def update(self, data):
        self.updated.update(data)
        if data.get("provider"):
            self.provider = data["provider"]
        if data.get("embeddingProvider"):
            self.embedding_provider = data["embeddingProvider"]
        return {"provider": self.provider, "embeddingProvider": self.embedding_provider}


class FakeOllama:
    """假 ollama：模型都"已安装"，服务在线，不真正联网。"""

    url = "http://127.0.0.1:11434"
    llm_model = "qwen3.5:4b"
    embedding_model = "nomic-embed-text"

    async def health(self):
        return True

    async def list_models(self):
        return [{"name": "qwen3.5:4b"}, {"name": "nomic-embed-text"}, {"name": "qwen3:4b"}]

    async def pull(self, model, emit=None):
        return {"pulled": True, "model": model}


@pytest.fixture
def _fake(monkeypatch):
    old_ollama = app.state.ollama
    old_gw = app.state.ai_gateway
    new_cfg = DummyConfig()
    # 替换 gateway.config 与 app.state.ollama
    new_gw = type("GW", (), {"config": new_cfg})()
    app.state.ai_gateway = new_gw
    app.state.ollama = FakeOllama()
    yield new_cfg
    app.state.ollama = old_ollama
    app.state.ai_gateway = old_gw


def test_status_ollama(_fake):
    r = client.get("/api/ai/ollama/status")
    assert r.status_code == 200
    b = r.json()
    assert b["healthy"] is True
    assert b["llmReady"] is True
    assert b["embeddingReady"] is True
    assert b["chatOnOllama"] is False  # 尚未挂载
    assert "qwen3.5:4b" in b["installed"]
    assert b["chatProvider"] == "openai"


def test_pull_started(_fake):
    r = client.post("/api/ai/ollama/pull", json={"model": "qwen3.5:4b"})
    assert r.status_code == 200
    assert r.json()["started"] is True
    # 状态可查询（后台可能正在拉取或完成）
    s = client.get("/api/ai/ollama/pull/qwen3.5:4b/status")
    assert s.status_code == 200
    assert s.json()["status"] in ("downloading", "done")


def test_apply_mounts_ollama(_fake):
    r = client.post("/api/ai/ollama/apply", json={"llmModel": "qwen3.5:4b", "embeddingModel": "nomic-embed-text"})
    assert r.status_code == 200
    b = r.json()
    assert b["ok"] is True
    assert b["chatProvider"] == "ollama"
    assert b["embedProvider"] == "ollama"
    assert _fake.updated.get("provider") == "ollama"
    assert _fake.updated.get("embeddingProvider") == "ollama"
    # 状态反映已挂载
    st = client.get("/api/ai/ollama/status").json()
    assert st["chatOnOllama"] is True


def test_apply_rejects_unknown_model(_fake):
    # 未安装的对话模型 → 400，提示先拉取
    r = client.post("/api/ai/ollama/apply", json={"llmModel": "no-such-model", "embeddingModel": "nomic-embed-text"})
    assert r.status_code == 400
