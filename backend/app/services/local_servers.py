"""统一本地模型服务管理：向量（embedding）/ 对话（llm）/ 重排（rerank）。

每类一个脚本（scripts/），用 conda 环境（CONDA_ENV）或当前 Python 拉起；
模型首次使用前需下载（model_hub 多路：ModelScope → HF-Mirror → HF），下载在后台线程执行。
"""
from __future__ import annotations

import shutil
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import Optional

from ..config import settings
from .ai_config import AIConfig, LOCAL_MODELS
from . import model_hub

SCRIPTS_DIR = Path(__file__).resolve().parents[2] / "scripts"


class LocalServersManager:
    def __init__(self, config: Optional[AIConfig] = None):
        self.config = config or AIConfig()
        self._procs: dict[str, subprocess.Popen] = {}
        self._downloads: dict[str, dict] = {}  # kind → {status, model, error}
        self._lock = threading.Lock()

    # ---------------- 元信息 ----------------

    def _meta(self, kind: str) -> dict:
        if kind == "embedding":
            return {"script": SCRIPTS_DIR / "kb_embedding_server.py",
                    "url": self.config.embedding_url,
                    "model": self.config.embedding_model}
        if kind == "llm":
            return {"script": SCRIPTS_DIR / "local_llm_server.py",
                    "url": self.config.local_llm_url,
                    "model": self.config.local_llm_model}
        if kind == "rerank":
            return {"script": SCRIPTS_DIR / "rerank_server.py",
                    "url": self.config.rerank_url,
                    "model": self.config.rerank_model}
        raise KeyError(f"未知本地服务类型: {kind}")

    def _port(self, url: str) -> int:
        return int(url.rsplit(":", 1)[-1])

    # ---------------- 状态 ----------------

    def status(self, kind: str) -> dict:
        m = self._meta(kind)
        running = self._port_alive(m["url"])
        download = self._downloads.get(kind, {})
        return {
            "kind": kind,
            "model": m["model"],
            "url": m["url"],
            "running": running,
            "downloaded": model_hub.is_model_cached(m["model"]),
            "downloading": download.get("status") == "downloading",
            "downloadError": download.get("error"),
        }

    def status_all(self) -> list[dict]:
        return [self.status(k) for k in ("embedding", "llm", "rerank")]

    def _port_alive(self, url: str) -> bool:
        try:
            import httpx
            return httpx.get(f"{url}/health", timeout=1).status_code == 200
        except Exception:
            return False

    # ---------------- 下载 ----------------

    def download(self, kind: str, model_id: str = "") -> dict:
        """后台线程下载模型（幂等：已缓存/下载中直接返回）。"""
        m = self._meta(kind)
        model = model_id or m["model"]
        dl = self._downloads.get(kind, {})
        if dl.get("status") == "downloading":
            return {"started": True, "message": "下载已在进行中"}
        if model_hub.is_model_cached(model):
            self._downloads[kind] = {"status": "done", "model": model}
            return {"started": True, "message": "模型已存在，无需下载"}

        self._downloads[kind] = {"status": "downloading", "model": model}
        thread = threading.Thread(target=self._download_thread, args=(kind, model), daemon=True)
        thread.start()
        return {"started": True, "message": f"开始下载 {model}（多路自动尝试，较大模型需等待）"}

    def _download_thread(self, kind: str, model: str) -> None:
        try:
            model_hub.resolve_model_path(model)
            self._downloads[kind] = {"status": "done", "model": model}
        except Exception as e:
            self._downloads[kind] = {"status": "error", "model": model, "error": str(e)}

    # ---------------- 启动 / 停止 ----------------

    def start(self, kind: str, model: str = "", wait_ready: bool = True) -> dict:
        """启动本地服务；服务已就绪则复用（探测 /health）。"""
        m = self._meta(kind)
        model = model or m["model"]
        if self._port_alive(m["url"]):
            return {"started": True, "pid": 0, "message": f"复用已在 {m['url']} 运行的服务"}

        conda = shutil.which("conda")
        if not conda:
            cmd = [sys.executable, str(m["script"]), "--port", str(self._port(m["url"])), "--model", model]
            launcher = "当前 Python"
        else:
            cmd = [conda, "run", "-n", settings.conda_env, "python",
                   str(m["script"]), "--port", str(self._port(m["url"])), "--model", model]
            launcher = f"conda 环境 {settings.conda_env}"

        try:
            proc = subprocess.Popen(
                cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                cwd=str(SCRIPTS_DIR.parent),
            )
        except Exception as e:
            return {"started": False, "error": f"启动失败: {e}"}
        self._procs[kind] = proc

        if not wait_ready:
            return {"started": True, "pid": proc.pid,
                    "message": f"已用 {launcher} 启动（后台加载中）"}

        for _ in range(60):
            if proc.poll() is not None:
                return {"started": False, "error": f"服务进程退出（{kind}），请检查 conda 环境依赖"}
            if self._port_alive(m["url"]):
                return {"started": True, "pid": proc.pid, "message": f"已用 {launcher} 启动"}
            time.sleep(1)
        return {"started": True, "pid": proc.pid,
                "message": "启动中（首次运行需下载/加载模型，可稍后查询状态）"}

    def stop(self, kind: str) -> dict:
        proc = self._procs.pop(kind, None)
        if proc is not None and proc.poll() is None:
            proc.terminate()
        return {"ok": True, "kind": kind}


# 全局单例（由 main.py 装配到 app.state.local_servers）
local_servers_manager = LocalServersManager()
