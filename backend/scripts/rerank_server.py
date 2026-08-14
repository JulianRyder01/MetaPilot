"""本地重排（rerank）服务：POST /rerank + /health。

用 transformers 加载 Qwen3-Reranker 系列（如 Qwen/Qwen3-Reranker-0.6B），
输入 (query, document) 对，输出 sigmoid 得分。

用法：
    conda run -n {env} python scripts/rerank_server.py --port 8762 --model Qwen/Qwen3-Reranker-0.6B
"""
from __future__ import annotations

import argparse
import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.services.model_hub import resolve_model_path  # noqa: E402


class RerankHandler(BaseHTTPRequestHandler):
    model = None
    tokenizer = None
    model_name = ""

    def log_message(self, fmt, *args):
        pass

    def _send(self, code: int, payload: dict):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.rstrip("/").endswith("/health"):
            self._send(200, {"ok": True, "model": self.model_name})
        else:
            self._send(404, {"error": "not found"})

    def do_POST(self):
        if not self.path.rstrip("/").endswith("/rerank"):
            self._send(404, {"error": "not found"})
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length) or b"{}")
        except Exception:
            self._send(400, {"error": "bad json"})
            return

        query = body.get("query") or ""
        documents = body.get("documents") or []
        top_k = body.get("top_k")
        if not query or not documents:
            self._send(400, {"error": "query 与 documents 必填"})
            return
        try:
            scores = self._score(query, documents)
        except Exception as e:
            self._send(500, {"error": f"重排失败: {e}"})
            return
        results = sorted(
            ({"index": i, "score": round(float(s), 6)} for i, s in enumerate(scores)),
            key=lambda x: -x["score"],
        )
        if top_k:
            results = results[: int(top_k)]
        self._send(200, {"results": results})

    def _score(self, query, documents):
        import numpy as np
        import torch

        pairs = [[query, doc] for doc in documents]
        inputs = self.tokenizer(
            pairs, padding=True, truncation=True, max_length=512, return_tensors="pt"
        )
        with torch.no_grad():
            logits = self.model(**inputs).logits.squeeze(-1)
        return (1 / (1 + np.exp(-logits.float().numpy()))).tolist()


def main():
    parser = argparse.ArgumentParser(description="本地重排服务")
    parser.add_argument("--port", type=int, default=8762)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--model", default="Qwen/Qwen3-Reranker-0.6B")
    parser.add_argument("--cache-dir", default="")
    args = parser.parse_args()

    from transformers import AutoModelForSequenceClassification, AutoTokenizer

    print(f"加载重排模型 {args.model}（首次运行自动下载，可能较久）...", flush=True)
    path = resolve_model_path(args.model, args.cache_dir)
    tokenizer = AutoTokenizer.from_pretrained(path, trust_remote_code=True)
    model = AutoModelForSequenceClassification.from_pretrained(path, trust_remote_code=True)
    model.eval()
    RerankHandler.model = model
    RerankHandler.tokenizer = tokenizer
    RerankHandler.model_name = args.model
    print(f"本地重排就绪: {args.model}", flush=True)

    server = ThreadingHTTPServer((args.host, args.port), RerankHandler)
    print(f"服务监听 http://{args.host}:{args.port} （/health、/rerank）", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
