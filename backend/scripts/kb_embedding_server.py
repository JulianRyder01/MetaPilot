"""本地 Embedding HTTP 服务（个人知识库插件使用）。

在 Conda 虚拟环境（如 Jyun）中运行：
    conda activate Jyun
    pip install torch transformers modelscope huggingface_hub
    python scripts/kb_embedding_server.py --port 8760 --model Qwen/Qwen3-Embedding-0.6B

支持的模型（Qwen3 两个 embedding 尺寸）：
- Qwen/Qwen3-Embedding-0.6B：轻量、显存友好（默认）
- Qwen/Qwen3-Embedding-4B：更强，需更多显存

模型获取（resolve_model_path 多路自动尝试）：
1. --model 指向本地目录（已下载）则直接加载；
2. ModelScope 下载（国内网络推荐）；
3. HuggingFace Mirror（HF_ENDPOINT=https://hf-mirror.com）；
4. HuggingFace 官方端点。
"""
from __future__ import annotations

import argparse
import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer

import numpy as np
import torch
from transformers import AutoModel, AutoTokenizer

DEFAULT_MODEL = "Qwen/Qwen3-Embedding-0.6B"

# Qwen3 系列两个 embedding 模型（模型 id → 展示名）
EMBEDDING_MODELS: dict[str, str] = {
    "Qwen/Qwen3-Embedding-0.6B": "Qwen3-Embedding-0.6B（轻量，默认）",
    "Qwen/Qwen3-Embedding-4B": "Qwen3-Embedding-4B（更强，需更多显存）",
}

# 多路下载顺序：ModelScope → HF-Mirror → HuggingFace 官方
_DOWNLOAD_ATTEMPTS = (
    ("modelscope", None),
    ("huggingface", "https://hf-mirror.com"),
    ("huggingface", None),
)


def resolve_model_path(model_id: str, cache_dir: str = "") -> str:
    """解析模型路径：本地目录直接返回；否则按 多路 顺序下载（ModelScope/HF-Mirror/HF）。"""
    if os.path.isdir(model_id):
        return model_id

    for backend, endpoint in _DOWNLOAD_ATTEMPTS:
        try:
            if backend == "modelscope":
                from modelscope import snapshot_download
                path = snapshot_download(model_id, cache_dir=cache_dir or None)
                print(f"已通过 ModelScope 下载模型到: {path}", flush=True)
                return path
            else:
                import huggingface_hub
                if endpoint:
                    old = os.environ.get("HF_ENDPOINT")
                    os.environ["HF_ENDPOINT"] = endpoint
                    try:
                        path = huggingface_hub.snapshot_download(model_id, cache_dir=cache_dir or None)
                        print(f"已通过 {endpoint} 下载模型到: {path}", flush=True)
                        return path
                    finally:
                        if old is None:
                            os.environ.pop("HF_ENDPOINT", None)
                        else:
                            os.environ["HF_ENDPOINT"] = old
                else:
                    path = huggingface_hub.snapshot_download(model_id, cache_dir=cache_dir or None)
                    print(f"已通过 HuggingFace 官方下载模型到: {path}", flush=True)
                    return path
        except Exception as e:
            print(f"下载尝试失败（{backend} {endpoint or ''}）: {e}", flush=True)
            continue

    raise RuntimeError(
        f"模型 {model_id} 下载失败：ModelScope / HuggingFace 镜像 / HuggingFace 官方均不可用，"
        "请检查网络，或手动下载后把 --model 指向本地目录"
    )


class EmbedHandler(BaseHTTPRequestHandler):
    model = None
    tokenizer = None
    model_name = ""

    def log_message(self, fmt, *args):
        pass  # 静默访问日志

    def _send(self, code: int, payload: dict):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/health":
            self._send(200, {"ok": True, "model": self.model_name or (self.model.config.name_or_path if self.model else "")})
        else:
            self._send(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/embed":
            return self._send(404, {"error": "not found"})
        try:
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length).decode("utf-8"))
            texts = body.get("texts", [])
            vectors = []
            for text in texts:
                vec = self._embed_one(text)
                vectors.append(vec)
            self._send(200, {"vectors": vectors})
        except Exception as e:
            self._send(500, {"error": str(e)})

    def _embed_one(self, text: str) -> list[float]:
        inputs = self.tokenizer(
            text, return_tensors="pt", truncation=True, max_length=8192, padding=True
        )
        with torch.no_grad():
            out = self.model(**inputs)
        v = out.last_hidden_state.mean(dim=1).squeeze(0).cpu().numpy()
        norm = np.linalg.norm(v)
        if norm > 0:
            v = v / norm
        return v.tolist()


def main():
    parser = argparse.ArgumentParser(description="Qwen3-Embedding 本地服务")
    parser.add_argument("--port", type=int, default=8760)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--model", default=DEFAULT_MODEL,
                        help="模型 id（本地目录或 Qwen/Qwen3-Embedding-0.6B / Qwen/Qwen3-Embedding-4B）")
    parser.add_argument("--cache-dir", default="", help="模型下载缓存目录（默认使用各平台默认缓存）")
    args = parser.parse_args()

    print(f"加载模型 {args.model} ...", flush=True)
    model_path = resolve_model_path(args.model, args.cache_dir)
    tokenizer = AutoTokenizer.from_pretrained(model_path, trust_remote_code=True)
    model = AutoModel.from_pretrained(model_path, trust_remote_code=True)
    model.eval()
    EmbedHandler.tokenizer = tokenizer
    EmbedHandler.model = model
    EmbedHandler.model_name = args.model
    print(f"Embedding 服务已就绪: http://{args.host}:{args.port}（模型 {args.model}）", flush=True)
    HTTPServer((args.host, args.port), EmbedHandler).serve_forever()


if __name__ == "__main__":
    main()
