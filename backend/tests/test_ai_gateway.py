"""AI 统一网关测试：openai/anthropic/local chat 转换、embedding、用量记录与成本计算、统计聚合。"""
import tempfile
from pathlib import Path

import pytest

from app.services.ai_config import AIConfig
from app.services.ai_gateway import AIGateway, NotConfiguredError
from app.storage.ai_usage import AIUsageStore

# 捕获最后一次请求（url/json/headers），并按脚本返回响应
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
        CAPTURED["headers"] = kwargs.get("headers")
        return FakeResponse(REPLIES.pop(0))


@pytest.fixture(autouse=True)
def _monkey_http(monkeypatch):
    CAPTURED.clear()
    REPLIES.clear()
    monkeypatch.setattr("app.services.ai_gateway.httpx.AsyncClient", FakeAsyncClient)


def _make(tmp: Path, provider="openai", base="https://api.example.com/v1", key="sk-test",
          model="gpt-x", prices=None, embed_provider="local_transformers") -> AIGateway:
    env = tmp / ".env"
    AIConfig(env_path=env).update({
        "provider": provider, "baseUrl": base, "apiKey": key, "chatModel": model,
        "embeddingProvider": embed_provider,
        "prices": prices or {"gpt-x": {"input": 2, "cachedInput": 1, "output": 3, "currency": "$"}},
        "currency": "$",
    })
    config = AIConfig(env_path=env)
    gateway = AIGateway(tmp, config, AIUsageStore(tmp))
    return gateway


@pytest.mark.asyncio
async def test_chat_openai_records_usage_and_cost(tmp_path):
    REPLIES.append({
        "choices": [{"message": {"content": "你好"}}],
        "usage": {"prompt_tokens": 100, "prompt_tokens_details": {"cached_tokens": 20},
                  "completion_tokens": 30},
        "model": "gpt-x",
    })
    gw = _make(tmp_path)
    r = await gw.chat([{"role": "user", "content": "hi"}], plugin="ai_insight")
    assert r["content"] == "你好"
    assert r["inputTokens"] == 100 and r["cachedTokens"] == 20 and r["outputTokens"] == 30
    assert CAPTURED["url"].endswith("/chat/completions")
    assert CAPTURED["headers"]["Authorization"] == "Bearer sk-test"
    # 成本 = ((100-20)*2 + 20*1 + 30*3)/1e6 = 270/1e6
    rec = gw.usage._load()[0]
    assert rec["plugin"] == "ai_insight" and rec["model"] == "gpt-x"
    assert rec["inputTokens"] == 100 and rec["outputTokens"] == 30
    assert abs(rec["cost"] - 0.00027) < 1e-9
    assert rec["currency"] == "$"


@pytest.mark.asyncio
async def test_chat_anthropic_format_and_cache(tmp_path):
    REPLIES.append({
        "content": [{"type": "text", "text": "anthropic 回答"}],
        "usage": {"input_tokens": 90, "cache_read_input_tokens": 10, "output_tokens": 25},
        "model": "claude-x",
    })
    gw = _make(tmp_path, provider="anthropic", base="https://api.anthropic.com",
               key="ant-key", model="claude-x")
    r = await gw.chat([
        {"role": "system", "content": "你是助手"},
        {"role": "user", "content": "问题"},
    ], plugin="core")
    assert r["content"] == "anthropic 回答"
    assert r["inputTokens"] == 90 and r["cachedTokens"] == 10 and r["outputTokens"] == 25
    body = CAPTURED["json"]
    assert body["system"] == "你是助手"
    assert all(m["role"] in ("user", "assistant") for m in body["messages"])
    assert CAPTURED["headers"]["x-api-key"] == "ant-key"
    assert "v1/messages" in CAPTURED["url"] or CAPTURED["url"].endswith("/messages")


@pytest.mark.asyncio
async def test_chat_local_uses_local_llm_url(tmp_path):
    REPLIES.append({
        "choices": [{"message": {"content": "本地回答"}}],
        "usage": {"prompt_tokens": 50, "completion_tokens": 10},
        "model": "Qwen/Qwen3-4B",
    })
    gw = _make(tmp_path, provider="local", base="", key="", model="Qwen/Qwen3-4B")
    r = await gw.chat([{"role": "user", "content": "hi"}], plugin="core")
    assert r["content"] == "本地回答"
    assert "127.0.0.1:8761" in CAPTURED["url"]
    assert r["provider"] == "local"


@pytest.mark.asyncio
async def test_chat_none_provider_raises(tmp_path):
    gw = _make(tmp_path, provider="none", base="", key="")
    with pytest.raises(NotConfiguredError):
        await gw.chat([{"role": "user", "content": "hi"}])


@pytest.mark.asyncio
async def test_embed_local_transformers(tmp_path):
    REPLIES.append({"vectors": [[1.0, 0.0], [0.0, 1.0]]})
    gw = _make(tmp_path)
    v = await gw.embed(["a", "b"])
    assert v == [[1.0, 0.0], [0.0, 1.0]]
    assert "127.0.0.1:8760" in CAPTURED["url"]
    assert CAPTURED["json"] == {"texts": ["a", "b"]}


@pytest.mark.asyncio
async def test_embed_openai_cloud(tmp_path):
    REPLIES.append({"data": [{"index": 0, "embedding": [0.1]}, {"index": 1, "embedding": [0.2]}]})
    gw = _make(tmp_path, embed_provider="openai")
    v = await gw.embed(["a", "b"])
    assert v == [[0.1], [0.2]]
    assert CAPTURED["url"].endswith("/embeddings")
    # 云端 embedding 记一次调用（tokens=0），model 为 embedding 模型
    assert gw.usage._load()[0]["model"] == "Qwen/Qwen3-Embedding-0.6B"


@pytest.mark.asyncio
async def test_rerank_local(tmp_path):
    REPLIES.append({"results": [{"index": 1, "score": 0.9}, {"index": 0, "score": 0.3}]})
    gw = _make(tmp_path)
    r = await gw.rerank("q", ["d1", "d2"], top_k=2)
    assert r == [{"index": 1, "score": 0.9}, {"index": 0, "score": 0.3}]
    assert "8762" in CAPTURED["url"]
    assert CAPTURED["json"]["query"] == "q"


@pytest.mark.asyncio
async def test_usage_summary_aggregates_and_filters(tmp_path):
    gw = _make(tmp_path)
    # 直接写入记录（跨两天）
    gw.usage.add({"ts": "2026-08-10T10:00:00", "plugin": "core", "model": "gpt-x", "provider": "openai",
                  "inputTokens": 100, "cachedTokens": 0, "outputTokens": 50, "cost": 0.0002, "currency": "$"})
    gw.usage.add({"ts": "2026-08-11T10:00:00", "plugin": "ai_insight", "model": "gpt-x", "provider": "openai",
                  "inputTokens": 200, "cachedTokens": 100, "outputTokens": 25, "cost": 0.0001, "currency": "$"})
    s = gw.usage_summary("all")
    assert s["totalCalls"] == 2
    assert s["totalTokens"] == 375  # 300 input + 75 output
    assert s["inputTokens"] == 300 and s["cachedTokens"] == 100 and s["outputTokens"] == 75
    assert abs(s["totalCost"] - 0.0003) < 1e-9
    assert s["currency"] == "$"
    assert len(s["byModel"]) == 1 and s["byModel"][0]["model"] == "gpt-x"
    assert s["byModel"][0]["calls"] == 2


def test_config_masks_key_and_legacy_fallback(tmp_path):
    env = tmp_path / ".env"
    env.write_text("MINIMAX_API_KEY=sk-legacy\nMINIMAX_BASE_URL=https://api.minimaxi.com/v1\n"
                   "MINIMAX_MODEL=MiniMax-M3\nEMBEDDING_MODEL=Qwen/Qwen3-Embedding-4B\n",
                   encoding="utf-8")
    cfg = AIConfig(env_path=env)
    # 旧配置兼容：未设 AI_* 时回退 minimax（openai 兼容）与 embedding_*
    assert cfg.provider == "openai"
    assert cfg.base_url == "https://api.minimaxi.com/v1"
    assert cfg.chat_model == "MiniMax-M3"
    assert cfg.embedding_model == "Qwen/Qwen3-Embedding-4B"
    assert cfg.masked_key() == "sk***"
    pub = cfg.to_public()
    assert pub["apiKey"] == "sk***" and pub["apiKeyConfigured"] is True
