"""核心 AI 问答 API 测试：/api/ai/chat（通用多轮对话，复用统一 AI 网关）。"""
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from app.services.ai_config import AIConfig
from app.services.ai_gateway import AIGateway
from app.services.local_servers import LocalServersManager
from app.storage.ai_usage import AIUsageStore

settings.embedding_auto_start = False

client = TestClient(app)

ENV_PATH: Path = Path(tempfile.gettempdir()) / "metapilot_ai_chat_test.env"
CAPTURED: dict = {}
REPLIES: list[dict] = []


class FakeResponse:
    def __init__(self, data):
        self._data = data

    def raise_for_status(self):
        pass

    def json(self):
        return self._data


class FakeAsyncClient:
    def __init__(self, timeout=None):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    async def post(self, url, **kwargs):
        CAPTURED["url"] = url
        CAPTURED["json"] = kwargs.get("json")
        return FakeResponse(REPLIES.pop(0))


def _reset():
    global ENV_PATH
    tmp = Path(tempfile.mkdtemp(prefix="metapilot_ai_chat_"))
    ENV_PATH = tmp / ".env"
    AIConfig(env_path=ENV_PATH).update({
        "provider": "openai", "baseUrl": "https://api.example.com/v1",
        "apiKey": "sk-test-abcdef123456", "chatModel": "gpt-x",
        "embeddingProvider": "local_transformers",
        "prices": {"gpt-x": {"input": 2, "cachedInput": 1, "output": 3, "currency": "$"}},
        "currency": "$",
    })
    app.state.ai_gateway = AIGateway(tmp, AIConfig(env_path=ENV_PATH), AIUsageStore(tmp))
    app.state.local_servers = LocalServersManager(app.state.ai_gateway.config)


def setup_function():
    _reset()


@pytest.fixture(autouse=True)
def _monkey_http(monkeypatch):
    CAPTURED.clear()
    REPLIES.clear()
    monkeypatch.setattr("app.services.ai_gateway.httpx.AsyncClient", FakeAsyncClient)


def test_chat_sends_multi_turn_history_and_returns_content():
    REPLIES.append({
        "choices": [{"message": {"content": "这是回答"}}],
        "usage": {"prompt_tokens": 30, "completion_tokens": 6},
        "model": "gpt-x",
    })
    r = client.post("/api/ai/chat", json={
        "messages": [
            {"role": "user", "content": "第一问"},
            {"role": "assistant", "content": "第一答"},
            {"role": "user", "content": "第二问"},
        ],
    })
    assert r.status_code == 200
    data = r.json()
    assert data["content"] == "这是回答"
    assert data["model"] == "gpt-x"
    assert data["provider"] == "openai"
    # 完整多轮历史原样透传给统一网关
    sent = CAPTURED["json"]
    assert [m["role"] for m in sent["messages"]] == ["user", "assistant", "user"]
    assert sent["messages"][0]["content"] == "第一问"
    # 计入用量
    usage = client.get("/api/ai/usage", params={"range": "all"}).json()
    assert usage["totalCalls"] == 1


def test_chat_rejects_empty_messages():
    r = client.post("/api/ai/chat", json={"messages": []})
    assert r.status_code == 400
    assert "不能为空" in r.json()["detail"]


def test_chat_rejects_too_many_messages():
    msgs = [{"role": "user", "content": "x"} for _ in range(101)]
    r = client.post("/api/ai/chat", json={"messages": msgs})
    assert r.status_code == 400
    assert "上限" in r.json()["detail"]


def test_chat_rejects_blank_content():
    r = client.post("/api/ai/chat", json={"messages": [{"role": "user", "content": "  "}]})
    assert r.status_code == 400


def test_chat_not_configured_returns_400():
    app.state.ai_gateway.config.update({"provider": "none"})
    r = client.post("/api/ai/chat", json={"messages": [{"role": "user", "content": "hi"}]})
    assert r.status_code == 400
    assert "未配置" in r.json()["detail"]