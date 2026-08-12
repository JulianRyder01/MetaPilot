"""本地 Embedding HTTP 服务（个人知识库插件使用）。

在 Conda 虚拟环境（如 Jyun）中运行：
    conda activate Jyun
    pip install torch transformers
    python scripts/kb_embedding_server.py --port 8760

模型首次运行会自动下载 Qwen3-Embedding-0.6B（约 1.5GB，缓存于 ~/.cache/huggingface）。
也可被后端按需拉起（见 app/services/embedding_server.py）。
"""
from __future__ import annotations

import argparse
import json
from http.server import BaseHTTPRequestHandler, HTTPServer

import numpy as np
import torch
from transformers import AutoModel, AutoTokenizer

DEFAULT_MODEL = "Qwen/Qwen3-Embedding-0.6B"


class EmbedHandler(BaseHTTPRequestHandler):
    model = None
    tokenizer = None

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
            self._send(200, {"ok": True, "model": self.model.config.name_or_path})
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
    parser.add_argument("--model", default=DEFAULT_MODEL)
    args = parser.parse_args()

    print(f"加载模型 {args.model} ...", flush=True)
    tokenizer = AutoTokenizer.from_pretrained(args.model, trust_remote_code=True)
    model = AutoModel.from_pretrained(args.model, trust_remote_code=True)
    model.eval()
    EmbedHandler.tokenizer = tokenizer
    EmbedHandler.model = model
    print(f"Embedding 服务已就绪: http://{args.host}:{args.port}", flush=True)
    HTTPServer((args.host, args.port), EmbedHandler).serve_forever()


if __name__ == "__main__":
    main()
