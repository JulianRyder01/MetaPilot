"""后端启动自动加载 embedding 服务的 lifespan 行为测试（程序一启动就加载，页面打开不再久等）。"""
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from app.services import embedding_server as es_mod

# 测试环境不自动拉起真实 embedding 服务进程（与 conftest.py 保持一致，兼容单独运行）
settings.embedding_auto_start = False


def test_lifespan_auto_starts_embedding(monkeypatch):
    """后端启动（lifespan）即自动拉起 embedding 服务（wait_ready=False 非阻塞），不依赖打开页面。"""
    calls: list[tuple] = []
    monkeypatch.setattr(
        es_mod.embedding_server_manager, "start",
        lambda model="", wait_ready=True: (calls.append((model, wait_ready)) or {"started": True}),
    )

    saved_auto, saved_provider = settings.embedding_auto_start, settings.embedding_provider
    settings.embedding_auto_start = True
    settings.embedding_provider = "local_transformers"
    try:
        with TestClient(app):
            pass
    finally:
        settings.embedding_auto_start = saved_auto
        settings.embedding_provider = saved_provider

    assert calls, "lifespan 未调用 embedding 服务启动"
    assert calls[0][1] is False, "启动时应非阻塞（wait_ready=False）"


def test_lifespan_skips_embedding_when_auto_start_off(monkeypatch):
    """embedding_auto_start=False 时 lifespan 不拉起服务（测试环境默认行为）。"""
    calls: list[tuple] = []
    monkeypatch.setattr(
        es_mod.embedding_server_manager, "start",
        lambda model="", wait_ready=True: (calls.append((model, wait_ready)) or {"started": True}),
    )

    saved_auto = settings.embedding_auto_start
    settings.embedding_auto_start = False
    try:
        with TestClient(app):
            pass
    finally:
        settings.embedding_auto_start = saved_auto

    assert calls == []
