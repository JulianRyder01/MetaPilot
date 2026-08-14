"""模型下载公共工具：多路尝试（ModelScope → HF-Mirror → HuggingFace 官方）。

供本地服务管理器（预下载 + 缓存检测）与本地服务脚本（启动时兜底下载）复用。
"""
from __future__ import annotations

import os

# 多路下载顺序：ModelScope → HF-Mirror → HuggingFace 官方
DOWNLOAD_ATTEMPTS = (
    ("modelscope", None),
    ("huggingface", "https://hf-mirror.com"),
    ("huggingface", None),
)


def resolve_model_path(model_id: str, cache_dir: str = "") -> str:
    """解析模型路径：本地目录直接返回；否则按 多路 顺序下载（ModelScope/HF-Mirror/HF）。"""
    if os.path.isdir(model_id):
        return model_id

    for backend, endpoint in DOWNLOAD_ATTEMPTS:
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


def is_model_cached(model_id: str) -> bool:
    """判断模型是否已下载（任一 hub 缓存命中即可）。"""
    if os.path.isdir(model_id):
        return True
    try:
        from huggingface_hub import try_to_load_from_cache
        if try_to_load_from_cache(model_id) is not None:
            return True
    except Exception:
        pass
    try:
        from modelscope.hub.snapshot_download import get_cache_dir  # noqa: F401
        cache_dir = os.path.join(os.path.expanduser("~"), ".cache", "modelscope", "hub")
        if os.path.isdir(cache_dir) and any(model_id.split("/")[-1] in name for name in os.listdir(cache_dir)):
            return True
    except Exception:
        pass
    return False
