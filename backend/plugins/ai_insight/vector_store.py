"""AI 洞察向量库：用开源向量数据库 FAISS 做建库与检索，FAISS 不可用时回退 numpy。

- 建库：每个数据源把向量批量写入 FAISS 索引（IndexFlatIP，内积 = 与原有 numpy 点积一致），
  同时持久化为 .faiss 文件；并保留 .npy 供回退/兼容旧索引。
- 检索：合并多个数据源向量后经 FAISS ANN 检索（`search`），结果与原有 numpy 精确一致；
  FAISS 未安装（如受平台限制）时自动回退 numpy 点积，保证功能可用。
- 归一化查询向量为 L2 后可用余弦（IndexFlatIP + 余弦等价于归一化内积）；为与既有行为完全一致，
  默认保持与旧实现相同的原始内积（不加归一化），需要归一化时传 normalize=True。

依赖说明：faiss-cpu 为可选依赖，写入 backend/requirements.txt；缺失时本模块自动降级。
"""
from __future__ import annotations

from pathlib import Path
from typing import Optional

import numpy as np

try:  # 可选依赖：FAISS（开源向量数据库）；缺失则回退 numpy 精确检索
    import faiss  # type: ignore
    HAVE_FAISS = True
except Exception:  # pragma: no cover
    faiss = None
    HAVE_FAISS = False


def available() -> bool:
    return HAVE_FAISS


def _norm(vectors: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    return vectors / norms


def build_index(vectors: np.ndarray, normalize: bool = False) -> object:
    """把向量数组建成 FAISS IndexFlatIP 并 add；FAISS 不可用返回 None。"""
    if not HAVE_FAISS:
        return None
    arr = np.ascontiguousarray(vectors, dtype=np.float32)
    if normalize:
        arr = _norm(arr).astype(np.float32)
    index = faiss.IndexFlatIP(arr.shape[1])
    index.add(arr)
    return index


def save_index_file(vectors: np.ndarray, path: Path, normalize: bool = False) -> bool:
    """把向量持久化成 .faiss 文件；返回是否成功（FAISS 不可用不写、返回 False）。"""
    if not HAVE_FAISS:
        return False
    idx = build_index(vectors, normalize)
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        faiss.write_index(idx, str(path))
        return True
    except Exception:
        return False


def load_index_file(path: Path) -> Optional[object]:
    """从 .faiss 文件加载索引；缺失/损坏/FAISS 不可用返回 None。"""
    if not HAVE_FAISS or not path.is_file():
        return None
    try:
        return faiss.read_index(str(path))
    except Exception:
        return None


def search(vectors: np.ndarray, query: np.ndarray, top_k: int,
           normalize: bool = False) -> tuple[list[int], list[float]]:
    """在向量矩阵上检索与 query 最相似的 top_k，返回 (命中行号降序, 对应分数)。

    等价于原有 numpy 点积 top-k；FAISS 可用时用 ANN，否则 numpy 精确计算。
    """
    arr = np.ascontiguousarray(vectors, dtype=np.float32)
    q = np.ascontiguousarray(query, dtype=np.float32).reshape(1, -1)
    k = min(top_k, len(arr))
    if k <= 0:
        return [], []
    if HAVE_FAISS:
        index = faiss.IndexFlatIP(arr.shape[1])
        if normalize:
            index.add(_norm(arr).astype(np.float32))
            q = _norm(q).astype(np.float32)
        else:
            index.add(arr)
        scores, idx = index.search(q, k)
        return idx[0].tolist(), scores[0].tolist()
    sims = arr @ q.reshape(-1)
    if normalize:
        sims = sims / (np.linalg.norm(arr, axis=1) * np.linalg.norm(q) + 1e-9)
    order = np.argsort(-sims)[:k].tolist()
    return order, [float(sims[i]) for i in order]
