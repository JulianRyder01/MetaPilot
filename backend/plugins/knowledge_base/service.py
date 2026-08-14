"""个人知识库插件核心服务：多数据源（默认库 / 软链接挂载）向量编码、检索、AI 问答与溯源。

数据源（source）：
- library：MetaPilot 默认库（含课程/笔记/知识库集合），索引其"库-文档集-文档-小节"；
- symlink：软链接插件挂载的本机目录，递归扫描文本文件并按 Markdown 标题分段。

索引按数据源独立存储：kb_dir/<key>/vectors.npy + meta.json，key = "{type}_{id}"。
问答支持对多个已索引数据源合并检索。
"""
from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path
from typing import Optional

import numpy as np

from app.config import settings
from app.services.embedding import EmbeddingError, EmbeddingProvider
from app.services.minimax import chat_completion
from app.storage.store import LibraryStore

EMBED_BATCH = 16
TOP_K = 5
EXCERPT_LEN = 800

# 软链接库索引的文本扩展名（知识库聚焦文档类文本）
KB_TEXT_EXTENSIONS = {".md", ".markdown", ".txt", ".text", ".rst"}

_HEADING_RE = re.compile(r"^(#{1,6})\s+(.*)$")


def source_key(source: dict) -> str:
    """数据源 → 索引存储 key：lib_<id> / symlink_<id>。"""
    return f"{source['type']}_{source['id']}"


class KBService:
    def __init__(self, store: LibraryStore, kb_dir: Path, embedding: Optional[EmbeddingProvider] = None,
                 symlink=None):
        self.store = store
        self.kb_dir = Path(kb_dir)
        self.kb_dir.mkdir(parents=True, exist_ok=True)
        self.embedding = embedding or EmbeddingProvider()
        # 软链接服务（由 knowledge_base 插件路由注入；未启用软链接插件时为 None）
        self.symlink = symlink

    # ---------------- 数据源 ----------------

    def list_sources(self) -> list[dict]:
        """可用数据源（默认库 + 软链接挂载），每项附索引状态。"""
        sources: list[dict] = []
        for lib in self.store.list_libraries():
            sources.append({"type": "library", "id": lib["id"], "name": lib["name"]})
        if self.symlink is not None:
            for m in self.symlink.list_mounts():
                sources.append({
                    "type": "symlink", "id": m["id"], "name": m["name"],
                    "root": m.get("root", ""),
                })
        for s in sources:
            st = self.status(source_key(s))
            s["status"] = st
            s["key"] = source_key(s)
        return sources

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

    @staticmethod
    def _split_markdown(content: str, fallback_title: str) -> list[tuple[str, str]]:
        """按 Markdown 标题分段（软链接文件 → 检索单元）。"""
        sections: list[tuple[str, str]] = []
        cur_title, cur_lines = "", []
        for line in content.splitlines():
            m = _HEADING_RE.match(line)
            if m:
                if cur_lines:
                    sections.append((cur_title or fallback_title, "\n".join(cur_lines)))
                cur_title = m.group(2).strip() or fallback_title
                cur_lines = [line]
            else:
                cur_lines.append(line)
        if cur_lines:
            sections.append((cur_title or fallback_title, "\n".join(cur_lines)))
        return sections or [(fallback_title, content)]

    def _collect_texts(self, source: dict) -> list[dict]:
        """把数据源转成检索单元列表：[{sectionId, sectionName, docId, docName, collectionName, collectionId, link, text}]。"""
        rows: list[dict] = []
        if source["type"] == "library":
            try:
                lib = self.store.get_library(source["id"])
            except KeyError:
                raise KeyError(f"库不存在: {source['id']}")
            for col in lib.get("collections", []):
                for doc in col.get("documents", []):
                    for sec in doc.get("sections", []):
                        text = self._section_text(doc, sec)
                        rows.append({
                            "sectionId": sec["id"],
                            "sectionName": sec["name"],
                            "docId": doc["id"],
                            "docName": doc["name"],
                            "collectionName": col["name"],
                            "collectionId": col["id"],
                            "link": {"kind": "learn", "collectionId": col["id"], "sectionId": sec["id"]},
                            "text": text,
                        })
        elif source["type"] == "symlink":
            if self.symlink is None:
                raise KeyError("软链接插件未启用，无法索引软链接库")
            mount = self.symlink.get_mount(source["id"])
            root = Path(mount["root"])
            if mount.get("type") == "file" and root.is_file():
                files = [root]
            else:
                files = sorted(
                    p for p in root.rglob("*")
                    if p.is_file() and p.suffix.lower() in KB_TEXT_EXTENSIONS
                )
            for p in files:
                try:
                    content = p.read_text(encoding="utf-8", errors="ignore")
                except OSError:
                    continue
                rel = str(p.relative_to(root)) if p != root else p.name
                for title, text in self._split_markdown(content, p.name):
                    rows.append({
                        "sectionId": f"{rel}#{title}",
                        "sectionName": title,
                        "docId": rel,
                        "docName": p.name,
                        "collectionName": mount["name"],
                        "collectionId": mount["id"],
                        "link": {"kind": "symlink", "mountId": mount["id"], "path": rel},
                        "text": text,
                    })
        else:
            raise ValueError(f"未知数据源类型: {source['type']}")
        return rows

    # ---------------- 索引 ----------------

    def _paths(self, key: str) -> tuple[Path, Path]:
        d = self.kb_dir / key
        return d / "vectors.npy", d / "meta.json"

    def status(self, key: str) -> dict:
        vec_path, meta_path = self._paths(key)
        if vec_path.exists() and meta_path.exists():
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
            return {"indexed": True, "sectionCount": len(meta.get("sections", [])),
                    "vectorDim": meta.get("vectorDim"), "updatedAt": meta.get("updatedAt"),
                    "source": meta.get("source")}
        return {"indexed": False, "sectionCount": 0}

    async def index_source(self, source: dict) -> dict:
        """对单个数据源建立/更新向量索引。"""
        key = source_key(source)
        rows = self._collect_texts(source)
        if not rows:
            return {"indexed": False, "sectionCount": 0, "source": source,
                    "error": "该数据源没有可索引的内容"}

        texts = [r["text"] for r in rows]
        vectors: list[list[float]] = []
        for i in range(0, len(texts), EMBED_BATCH):
            batch = texts[i:i + EMBED_BATCH]
            vectors.extend(await self.embedding.embed(batch))

        arr = np.asarray(vectors, dtype=np.float32)
        meta = {
            "key": key,
            "source": source,
            "updatedAt": datetime.now().isoformat(timespec="seconds"),
            "vectorDim": int(arr.shape[1]),
            "sections": [
                {
                    "sectionId": r["sectionId"],
                    "sectionName": r["sectionName"],
                    "docId": r["docId"],
                    "docName": r["docName"],
                    "collectionName": r["collectionName"],
                    "collectionId": r["collectionId"],
                    "link": r["link"],
                    "excerpt": r["text"][:EXCERPT_LEN],
                }
                for r in rows
            ],
        }
        d = self.kb_dir / key
        d.mkdir(parents=True, exist_ok=True)
        np.save(d / "vectors.npy", arr)
        (d / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
        return {"indexed": True, "sectionCount": len(rows), "vectorDim": int(arr.shape[1]),
                "source": source}

    # ---------------- 问答 ----------------

    def _load_index(self, key: str) -> tuple[np.ndarray, dict]:
        vec_path, meta_path = self._paths(key)
        if not (vec_path.exists() and meta_path.exists()):
            raise RuntimeError(f"数据源 {key} 尚未建立向量索引，请先在「建索引」步骤执行")
        return np.load(vec_path), json.loads(meta_path.read_text(encoding="utf-8"))

    async def ask(self, sources: list[dict], question: str, top_k: int = TOP_K) -> dict:
        """对多个已索引数据源合并检索并生成回答（带溯源）。"""
        if not sources:
            raise RuntimeError("请至少选择一个已索引的数据源")

        all_vectors: list[np.ndarray] = []
        all_sections: list[dict] = []
        for s in sources:
            vectors, meta = self._load_index(source_key(s))
            if len(meta.get("sections", [])) == 0:
                continue
            all_vectors.append(vectors)
            all_sections.extend(meta["sections"])
        if not all_vectors:
            raise RuntimeError("所选数据源索引均为空，请先建立索引")

        combined = np.vstack(all_vectors)
        q = (await self.embedding.embed([question]))[0]
        q = np.asarray(q, dtype=np.float32)
        sims = combined @ q
        k = min(top_k, len(all_sections))
        top_idx = np.argsort(-sims)[:k].tolist()

        sources_out = []
        context_lines = []
        for n, i in enumerate(top_idx, start=1):
            s = all_sections[i]
            score = float(sims[i])
            sources_out.append({**s, "score": round(score, 4)})
            context_lines.append(
                f"[来源{n}] 数据源《{s['collectionName']}》文档《{s['docName']}》"
                f"内容“{s['sectionName']}”：\n{s['excerpt']}"
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
        return {"answer": answer, "sources": sources_out}
