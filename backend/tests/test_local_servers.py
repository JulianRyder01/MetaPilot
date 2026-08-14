"""统一本地模型服务管理测试：状态、下载（后台线程+幂等）、启动（复用/拉起）。"""
import time
from pathlib import Path

import pytest

from app.services.ai_config import AIConfig
from app.services.local_servers import LocalServersManager


def _make(tmp_path: Path) -> LocalServersManager:
    env = tmp_path / ".env"
    AIConfig(env_path=env).update({
        "provider": "local", "baseUrl": "", "apiKey": "",
        "embeddingProvider": "local_transformers",
    })
    mgr = LocalServersManager(AIConfig(env_path=env))
    return mgr


def test_status_not_downloaded_not_running(tmp_path, monkeypatch):
    monkeypatch.setattr("app.services.local_servers.model_hub.is_model_cached", lambda m: False)
    monkeypatch.setattr("app.services.local_servers.LocalServersManager._port_alive", lambda self, url: False)
    mgr = _make(tmp_path)
    st = mgr.status("llm")
    assert st["kind"] == "llm"
    assert st["running"] is False and st["downloaded"] is False
    assert st["url"] == "http://127.0.0.1:8761"
    assert st["model"] == "Qwen/Qwen3-4B"
    all_st = mgr.status_all()
    assert [s["kind"] for s in all_st] == ["embedding", "llm", "rerank"]


def test_download_is_idempotent_when_cached(tmp_path, monkeypatch):
    monkeypatch.setattr("app.services.local_servers.model_hub.is_model_cached", lambda m: True)
    mgr = _make(tmp_path)
    r = mgr.download("embedding")
    assert r["started"] is True and "已存在" in r["message"]
    assert mgr.status("embedding")["downloaded"] is True


def test_download_runs_in_background(tmp_path, monkeypatch):
    calls = {"resolve": 0}

    def fake_resolve(model, cache_dir=""):
        calls["resolve"] += 1
        return model

    monkeypatch.setattr("app.services.local_servers.model_hub.resolve_model_path", fake_resolve)
    monkeypatch.setattr("app.services.local_servers.model_hub.is_model_cached", lambda m: False)
    mgr = _make(tmp_path)
    r = mgr.download("rerank")
    assert r["started"] is True
    # 轮询等待后台线程完成
    deadline = time.time() + 5
    while mgr.status("rerank")["downloading"] and time.time() < deadline:
        time.sleep(0.05)
    assert mgr.status("rerank")["downloaded"] is False  # 缓存检测仍 mock False
    assert calls["resolve"] == 1
    assert mgr._downloads["rerank"]["status"] == "done"


def test_download_reports_error(tmp_path, monkeypatch):
    def boom(model, cache_dir=""):
        raise RuntimeError("网络不可用")

    monkeypatch.setattr("app.services.local_servers.model_hub.resolve_model_path", boom)
    monkeypatch.setattr("app.services.local_servers.model_hub.is_model_cached", lambda m: False)
    mgr = _make(tmp_path)
    mgr.download("llm")
    deadline = time.time() + 5
    while mgr.status("llm")["downloading"] and time.time() < deadline:
        time.sleep(0.05)
    assert "网络不可用" in mgr.status("llm")["downloadError"]


def test_start_reuses_alive_service(tmp_path, monkeypatch):
    monkeypatch.setattr("app.services.local_servers.LocalServersManager._port_alive", lambda self, url: True)
    mgr = _make(tmp_path)
    r = mgr.start("embedding")
    assert r["started"] is True and "复用" in r["message"]


def test_start_launches_process(tmp_path, monkeypatch):
    monkeypatch.setattr("app.services.local_servers.LocalServersManager._port_alive", lambda self, url: False)

    class FakeProc:
        pid = 12345

        def poll(self):
            return None  # 存活

        def terminate(self):
            self.pid = None

    monkeypatch.setattr(
        "app.services.local_servers.subprocess.Popen",
        lambda cmd, **kw: FakeProc(),
    )
    mgr = _make(tmp_path)
    r = mgr.start("llm", wait_ready=False)
    assert r["started"] is True and r["pid"] == 12345
    # 停止
    stop = mgr.stop("llm")
    assert stop["ok"] is True
