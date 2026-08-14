"""本地 LLM 服务：OpenAI 兼容 /v1/chat/completions + /health。

用 transformers 加载 Qwen3 系列对话模型（如 Qwen/Qwen3-4B），
首次启动自动多路下载（ModelScope → HF-Mirror → HuggingFace）。

用法：
    conda run -n {env} python scripts/local_llm_server.py --port 8761 --model Qwen/Qwen3-4B
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

# 允许从 backend 目录直接运行（复用 app.services.model_hub 下载逻辑）
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.services.model_hub import resolve_model_path  # noqa: E402


class LLMHandler(BaseHTTPRequestHandler):
    model = None
    tokenizer = None
    model_name = ""
    device = "cpu"

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
        if not self.path.rstrip("/").endswith("/v1/chat/completions"):
            self._send(404, {"error": "not found"})
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length) or b"{}")
        except Exception:
            self._send(400, {"error": "bad json"})
            return

        messages = body.get("messages") or []
        max_tokens = int(body.get("max_tokens") or 1024)
        temperature = float(body.get("temperature") or 0.3)
        try:
            text, prompt_tokens, completion_tokens = self._generate(messages, max_tokens, temperature)
        except Exception as e:
            self._send(500, {"error": f"生成失败: {e}"})
            return

        self._send(200, {
            "id": "chatcmpl-local", "object": "chat.completion",
            "model": self.model_name,
            "choices": [{"index": 0, "message": {"role": "assistant", "content": text},
                         "finish_reason": "stop"}],
            "usage": {"prompt_tokens": prompt_tokens, "completion_tokens": completion_tokens,
                      "total_tokens": prompt_tokens + completion_tokens},
        })

    def _generate(self, messages, max_tokens, temperature):
        import torch

        tokenizer = self.tokenizer
        prompt = tokenizer.apply_chat_template(
            messages, tokenize=False, add_generation_prompt=True
        )
        inputs = tokenizer(prompt, return_tensors="pt").to(self.device)
        prompt_tokens = int(inputs["input_ids"].shape[1])
        gen_kwargs = {
            "max_new_tokens": max_tokens,
            "do_sample": temperature > 0,
            "pad_token_id": tokenizer.eos_token_id,
        }
        if temperature > 0:
            gen_kwargs["temperature"] = temperature
        with torch.no_grad():
            out = self.model.generate(**inputs, **gen_kwargs)
        new_tokens = out[0][inputs["input_ids"].shape[1]:]
        text = tokenizer.decode(new_tokens, skip_special_tokens=True)
        return text, prompt_tokens, int(len(new_tokens))


def main():
    parser = argparse.ArgumentParser(description="本地 LLM 服务（OpenAI 兼容）")
    parser.add_argument("--port", type=int, default=8761)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--model", default="Qwen/Qwen3-4B")
    parser.add_argument("--cache-dir", default="")
    args = parser.parse_args()

    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer

    print(f"加载模型 {args.model}（首次运行自动下载，可能较久）...", flush=True)
    path = resolve_model_path(args.model, args.cache_dir)
    tokenizer = AutoTokenizer.from_pretrained(path, trust_remote_code=True)
    model = AutoModelForCausalLM.from_pretrained(
        path, trust_remote_code=True, torch_dtype=torch.float16 if torch.cuda.is_available() else torch.float32,
    )
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model.to(device)
    model.eval()
    LLMHandler.model = model
    LLMHandler.tokenizer = tokenizer
    LLMHandler.model_name = args.model
    LLMHandler.device = device
    print(f"本地 LLM 就绪: {args.model}（{device}）", flush=True)

    server = ThreadingHTTPServer((args.host, args.port), LLMHandler)
    print(f"服务监听 http://{args.host}:{args.port} （/health、/v1/chat/completions）", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
