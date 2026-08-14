"""后端启动自动加载本地向量服务的 lifespan 行为测试（程序一启动就加载，页面打开不再久等）。

核心 1.1.1 起统一由 LocalServersManager 管理（embedding/llm/rerank）。
"""
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app

# 测试环境不自动拉起真实 embedding 服务进程
settings.embedding_auto_start = False


def _patch_local_servers(monkeypatch):
    calls: list[tuple] = []
    monkeypatch.setattr(
        app.state.local_servers, "start",
        lambda kind, model="", wait_ready=True: (
            calls.append((kind, model, wait_ready)) or {"started": True}
        ),
    )

    class FakeConfig:
        embedding_provider = "local_transformers"

    monkeypatch.setattr(app.state.ai_gateway, "config", FakeConfig())
    return calls


def test_lifespan_auto_starts_embedding(monkeypatch):
    """后端启动（lifespan）即自动拉起 embedding 服务（wait_ready=False 非阻塞），不依赖打开页面。"""
    calls = _patch_local_servers(monkeypatch)

    saved_auto = settings.embedding_auto_start
    settings.embedding_auto_start = True
    try:
        with TestClient(app):
            pass
    finally:
        settings.embedding_auto_start = saved_auto

    assert calls, "lifespan 未调用本地服务启动"
    assert calls[0][0] == "embedding"
    assert calls[0][2] is False, "启动时应非阻塞（wait_ready=False）"


def test_lifespan_skips_embedding_when_auto_start_off(monkeypatch):
    """embedding_auto_start=False 时 lifespan 不拉起服务（测试环境默认行为）。"""
    calls = _patch_local_servers(monkeypatch)

    saved_auto = settings.embedding_auto_start
    settings.embedding_auto_start = False
    try:
        with TestClient(app):
            pass
    finally:
        settings.embedding_auto_start = saved_auto

    assert calls == []
