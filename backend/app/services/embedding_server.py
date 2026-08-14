"""本地 embedding 服务进程管理：按需用 conda 环境拉起 kb_embedding_server.py。"""
from __future__ import annotations

import shutil
import subprocess
import sys
import time
from pathlib import Path

from ..config import settings


class EmbeddingServerManager:
    def __init__(self, port: int = 0, conda_env: str = "", script: str = ""):
        self.port = port or int(settings.embedding_url.rsplit(":", 1)[-1])
        self.conda_env = conda_env or settings.conda_env
        self.script = Path(script) or (
            Path(__file__).resolve().parents[2] / "scripts" / "kb_embedding_server.py"
        )
        self.proc: subprocess.Popen | None = None

    def is_running(self) -> bool:
        return self.proc is not None and self.proc.poll() is None

    def start(self, model: str = "") -> dict:
        """启动本地 embedding 服务进程；model 可指定 Qwen3 模型 id（默认 settings.embedding_model）。"""
        if self.is_running():
            return {"started": True, "pid": self.proc.pid, "message": "服务已在运行"}

        model = model or settings.embedding_model
        conda = shutil.which("conda")
        if not conda:
            # 当前环境直接跑（需已安装 torch/transformers）
            cmd = [sys.executable, str(self.script), "--port", str(self.port), "--model", model]
            launcher = "当前 Python"
        else:
            cmd = [conda, "run", "-n", self.conda_env, "python",
                   str(self.script), "--port", str(self.port), "--model", model]
            launcher = f"conda 环境 {self.conda_env}"

        try:
            self.proc = subprocess.Popen(
                cmd,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                cwd=str(self.script.parent.parent),
            )
        except Exception as e:
            return {"started": False, "error": f"启动失败: {e}"}

        # 等待就绪（最多 60s；模型下载可能更久，超时不报错）
        for _ in range(60):
            if self.proc.poll() is not None:
                return {"started": False, "error": "embedding 服务进程退出，请检查依赖安装"}
            try:
                import httpx
                r = httpx.get(f"http://127.0.0.1:{self.port}/health", timeout=1)
                if r.status_code == 200:
                    return {"started": True, "pid": self.proc.pid, "message": f"已用 {launcher} 启动"}
            except Exception:
                time.sleep(1)
        return {"started": True, "pid": self.proc.pid,
                "message": "启动中（首次运行需下载模型，可稍后查询状态）"}

    def stop(self) -> None:
        if self.proc is not None and self.proc.poll() is None:
            self.proc.terminate()
            self.proc = None


embedding_server_manager = EmbeddingServerManager()
