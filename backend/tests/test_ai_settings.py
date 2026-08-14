"""核心 AI 配置 API 测试：/api/ai/config（掩码与写回 .env）、usage、local-models、test。"""
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

ENV_PATH: Path = Path(tempfile.gettempdir()) / "metapilot_ai_test.env"

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
    tmp = Path(tempfile.mkdtemp(prefix="metapilot_ai_"))
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


def test_get_config_masks_key_and_lists_local_models():
    r = client.get("/api/ai/config")
    assert r.status_code == 200
    data = r.json()
    assert data["provider"] == "openai"
    assert data["apiKey"] == "sk-tes...3456"
    assert data["apiKeyConfigured"] is True
    assert data["chatModel"] == "gpt-x"
    assert data["currencies"] == ["$", "¥"]
    kinds = [m["kind"] for m in data["localModels"]]
    assert kinds == ["embedding", "llm", "rerank"]


def test_put_config_updates_env_and_keeps_key_when_blank():
    r = client.put("/api/ai/config", json={
        "chatModel": "gpt-new",
        "apiKey": "",  # 留空保持原值
        "prices": {"gpt-new": {"input": 1, "cachedInput": 0.5, "output": 2, "currency": "$"}},
    })
    assert r.status_code == 200
    data = r.json()
    assert data["chatModel"] == "gpt-new"
    assert data["apiKey"] == "sk-tes...3456"  # 未变

    # 重新实例化（模拟重启）验证写回 .env 生效
    gw = AIGateway(app.state.ai_gateway.data_dir, AIConfig(env_path=ENV_PATH))
    assert gw.config.chat_model == "gpt-new"
    assert gw.config.api_key == "sk-test-abcdef123456"
    assert gw.config.price_for("gpt-new")["output"] == 2


def test_usage_endpoint_reports_calls_tokens_cost():
    gw = app.state.ai_gateway
    gw.usage.add({"ts": "2026-08-10T10:00:00", "plugin": "ai_insight", "model": "gpt-x",
                  "provider": "openai", "inputTokens": 100, "cachedTokens": 0,
                  "outputTokens": 50, "cost": 0.00035, "currency": "$"})
    r = client.get("/api/ai/usage", params={"range": "all"})
    assert r.status_code == 200
    data = r.json()
    assert data["totalCalls"] == 1
    assert data["totalTokens"] == 150
    assert data["byModel"][0]["model"] == "gpt-x"
    assert abs(data["totalCost"] - 0.00035) < 1e-9


def test_local_models_download_start_stop(monkeypatch):
    monkeypatch.setattr("app.services.local_servers.model_hub.is_model_cached", lambda m: True)
    r = client.post("/api/ai/local-models/download", json={"kind": "llm"})
    assert r.status_code == 200
    assert "已存在" in r.json()["message"]

    # 启动：探测到存活 → 复用
    monkeypatch.setattr("app.services.local_servers.LocalServersManager._port_alive", lambda self, url: True)
    r = client.post("/api/ai/local-models/start", json={"kind": "llm"})
    assert r.status_code == 200 and "复用" in r.json()["message"]

    r = client.post("/api/ai/local-models/stop", json={"kind": "llm"})
    assert r.status_code == 200 and r.json()["ok"] is True

    r = client.post("/api/ai/local-models/download", json={"kind": "nope"})
    assert r.status_code == 422  # kind 白名单校验失败


def test_ai_test_endpoint_calls_and_records_usage():
    REPLIES.append({
        "choices": [{"message": {"content": "pong"}}],
        "usage": {"prompt_tokens": 10, "completion_tokens": 3},
        "model": "gpt-x",
    })
    r = client.post("/api/ai/test")
    assert r.status_code == 200
    data = r.json()
    assert data["ok"] is True and data["model"] == "gpt-x"
    assert data["inputTokens"] == 10 and data["outputTokens"] == 3
    # 计入用量
    usage = client.get("/api/ai/usage").json()
    assert usage["totalCalls"] == 1
