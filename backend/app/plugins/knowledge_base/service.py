"""个人知识库插件核心服务：向量编码、检索、AI 问答与溯源。"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

import numpy as np

from ...config import settings
from ...services.embedding import EmbeddingError, EmbeddingProvider
from ...services.minimax import chat_completion
from ...storage.store import LibraryStore

EMBED_BATCH = 16
TOP_K = 5
EXCERPT_LEN = 800


class KBService:
    def __init__(self, store: LibraryStore, kb_dir: Path, embedding: Optional[EmbeddingProvider] = None):
        self.store = store
        self.kb_dir = Path(kb_dir)
        self.kb_dir.mkdir(parents=True, exist_ok=True)
        self.embedding = embedding or EmbeddingProvider()

    # ---------------- 文本化 ----------------

    @staticmethod
    def _section_text(doc: dict, sec: dict) -> str:
        parts = [f"# {sec['name']}"]
        for b in sec.get("blocks", []):
            t = b.get("type")
            if t == "markdown":
                parts.append(b.get("content", ""))
            elif t in ("single_choice", "multiple_choice"):
                q = b.get("question", "")
                opts = "；".join(b.get("options", []))
                parts.append(f"题目：{q}；选项：{opts}")
            elif t in ("fill_blank", "short_answer"):
                q = b.get("question", "")
                ref = b.get("reference") or "；".join(b.get("blanks", []))
                parts.append(f"题目：{q}；参考答案：{ref}")
            elif t == "interactive":
                parts.append(b.get("title", "交互演示"))
        return "\n".join(parts)

    def _collect_sections(self, collection_id: str) -> list[tuple[dict, dict, dict]]:
        """返回 [(collection, doc, section)]。"""
        result = []
        for it in self.store.list_libraries():
            try:
                lib = self.store.get_library(it["id"])
            except KeyError:
                continue
            for col in lib.get("collections", []):
                if col["id"] != collection_id:
                    continue
                for doc in col.get("documents", []):
                    for sec in doc.get("sections", []):
                        result.append((col, doc, sec))
                return result
        raise KeyError(f"课程不存在: {collection_id}")

    # ---------------- 索引 ----------------

    def _paths(self, cid: str) -> tuple[Path, Path]:
        d = self.kb_dir / cid
        return d / "vectors.npy", d / "meta.json"

    def status(self, cid: str) -> dict:
        vec_path, meta_path = self._paths(cid)
        if vec_path.exists() and meta_path.exists():
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
            return {"indexed": True, "sectionCount": len(meta.get("sections", [])),
                    "vectorDim": meta.get("vectorDim"), "updatedAt": meta.get("updatedAt")}
        return {"indexed": False, "sectionCount": 0}

    async def index_collection(self, cid: str) -> dict:
        rows = self._collect_sections(cid)
        if not rows:
            return {"indexed": False, "sectionCount": 0, "error": "课程没有小节"}

        texts = [self._section_text(doc, sec) for _, doc, sec in rows]
        vectors: list[list[float]] = []
        for i in range(0, len(texts), EMBED_BATCH):
            batch = texts[i:i + EMBED_BATCH]
            vectors.extend(await self.embedding.embed(batch))

        arr = np.asarray(vectors, dtype=np.float32)
        meta = {
            "collectionId": cid,
            "updatedAt": __import__("datetime").datetime.now().isoformat(timespec="seconds"),
            "vectorDim": int(arr.shape[1]),
            "sections": [
                {
                    "sectionId": sec["id"],
                    "sectionName": sec["name"],
                    "docId": doc["id"],
                    "docName": doc["name"],
                    "collectionName": col["name"],
                    "excerpt": self._section_text(doc, sec)[:EXCERPT_LEN],
                }
                for (col, doc, sec) in rows
            ],
        }
        d = self.kb_dir / cid
        d.mkdir(parents=True, exist_ok=True)
        np.save(d / "vectors.npy", arr)
        (d / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
        return {"indexed": True, "sectionCount": len(rows), "vectorDim": int(arr.shape[1])}

    # ---------------- 问答 ----------------

    async def ask(self, cid: str, question: str, top_k: int = TOP_K) -> dict:
        vec_path, meta_path = self._paths(cid)
        if not (vec_path.exists() and meta_path.exists()):
            raise RuntimeError("该课程尚未建立向量索引，请先执行索引")

        vectors = np.load(vec_path)
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        sections = meta["sections"]
        if len(sections) == 0:
            raise RuntimeError("索引为空")

        q = (await self.embedding.embed([question]))[0]
        q = np.asarray(q, dtype=np.float32)
        sims = vectors @ q
        k = min(top_k, len(sections))
        top_idx = np.argsort(-sims)[:k].tolist()

        sources = []
        context_lines = []
        for n, i in enumerate(top_idx, start=1):
            s = sections[i]
            score = float(sims[i])
            sources.append({**s, "score": round(score, 4)})
            context_lines.append(
                f"[来源{n}] 文档《{s['docName']}》知识点“{s['sectionName']}”：\n{s['excerpt']}"
            )

        prompt = (
            "你是个人知识库问答助手。请只根据下面给出的资料回答用户问题，资料不足时明确说明。\n\n"
            + "\n\n".join(context_lines)
            + f"\n\n问题：{question}\n\n"
            + "要求：用中文简洁作答；需要引用资料处用 [来源N] 标注；回答末尾列出引用的来源编号。"
        )
        answer = await chat_completion(
            [{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=1024,
        )
        return {"answer": answer, "sources": sources}
