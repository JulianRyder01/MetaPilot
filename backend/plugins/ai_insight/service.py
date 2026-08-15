"""AI 洞察插件核心服务：多粒度数据源（库 / 文档集 / 文档 / 软链接挂载或挂载内路径）
向量编码、检索、多模式 AI 思考与洞察规划（多轮 agent 生成图表或课程）。

索引按数据源独立存储：data_dir/<key>/vectors.npy + meta.json，key 规则：
- lib_<库id> / col_<文档集id> / doc_<文档id> / sym_<挂载id>（整个挂载）/ sym_<挂载id>_<路径hash>（挂载内路径）。

索引进度：后台线程执行（线程内独立事件循环），进度写入 self._tasks，供前端轮询显示进度条；
未建索引直接提问时返回 NotIndexedError（前端自动触发建索引并等待完成后重发）。
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import re
import threading
from datetime import datetime
from pathlib import Path
from typing import Optional

import numpy as np

from app.config import settings
from app.plugins.base import manager
from app.services.ai_gateway import AIGateway
from app.storage.store import LibraryStore

EMBED_BATCH = 16
TOP_K = 5
EXCERPT_LEN = 800
# 软链接索引的文本扩展名白名单
TEXT_EXTENSIONS = {".md", ".markdown", ".txt", ".text", ".rst"}
# 对话/规划可携带的最大资料字符数（超出部分按来源顺序截断）
MAX_CONTEXT_CHARS = 30000
# 洞察规划检索的 top-k（context 更宽，便于发现联系）
PLAN_TOP_K = 12

_HEADING_RE = re.compile(r"^(#{1,6})\s+(.*)$")

# 思考模式 → system prompt（描述保持通用，不写死具体数据源/插件名）
MODE_PROMPTS: dict[str, str] = {
    "assist": (
        "你是 AI 洞察助手。请查阅下面给出的资料，分析它们之间的联系，回答用户问题，"
        "并给出有依据的建议。只依据资料回答，资料不足时明确说明。"
    ),
    "wander": (
        "你是 AI 洞察助手。请结合下面资料与用户给出的思考方向进行思维漫游："
        "发散联想资料之间以及资料与更广知识的联系，提出有启发的视角、假设与值得深挖的问题。"
    ),
    "reflect": (
        "你是 AI 洞察助手。请仔细审视下面资料与用户输入，归纳出用户可能没有注意到的地方："
        "隐含假设、遗漏的联系、潜在风险或机会，并说明依据。"
    ),
}

# 洞察规划输出的节点颜色候选（JSON Canvas 兼容）
CANVAS_COLORS = ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#8b5cf6"]


def _key_for(source: dict) -> str:
    """数据源 → 索引存储 key。"""
    t = source["type"]
    if t == "library":
        return f"lib_{source['id']}"
    if t == "collection":
        return f"col_{source['id']}"
    if t == "document":
        return f"doc_{source['id']}"
    if t == "symlink":
        path = (source.get("path") or "").strip().replace("\\", "/").strip("/")
        if not path:
            return f"sym_{source['id']}"
        h = hashlib.md5(path.encode("utf-8")).hexdigest()[:8]
        return f"sym_{source['id']}_{h}"
    raise ValueError(f"未知数据源类型: {t}")


def _extract_json(text: str) -> dict:
    """从 AI 输出中提取 JSON（容忍 <think> 块、markdown 代码围栏与前后杂质）。"""
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL)
    text = re.sub(r"```(?:json)?", "", text, flags=re.IGNORECASE).strip()
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end <= start:
        raise ValueError("AI 输出中未找到 JSON 对象")
    return json.loads(text[start:end + 1])


class NotIndexedError(RuntimeError):
    """所选数据源尚未建立索引（前端据此自动建索引并等待完成）。"""

    def __init__(self, keys: list[str]):
        super().__init__("所选数据源尚未建立向量索引，请先建立索引")
        self.keys = keys


class InsightService:
    def __init__(self, store: LibraryStore, data_dir: Path, embedding=None,
                 symlink=None, gateway: Optional[AIGateway] = None):
        self.store = store
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)
        # AI 统一网关（核心 1.1.1 起）：所有 AI 调用经 MetaPilot 中转并统计用量，
        # 由路由注入 app.state.ai_gateway；测试可传入替身
        self.gateway = gateway
        # 软链接服务（由路由懒注入；软链接插件未启用时为 None）
        self.symlink = symlink
        # 索引进度表：key → {status: running|done|error, total, done, error}
        self._tasks: dict[str, dict] = {}

    # ---------------- 资源树 ----------------

    def resources(self) -> dict:
        """可选择的资源树：库 → 文档集 → 文档；挂载类数据源（软链接插件提供）。

        sourceTypes 携带可用挂载类数据源的展示元数据（label/链接模板来自能力提供方声明），
        本插件不写死其它插件的描述与跳转路径。
        """
        libraries = []
        for lib in self.store.list_libraries():
            lib_info = self.store.get_library(lib["id"])
            collections = []
            for col in lib_info.get("collections", []):
                documents = []
                for doc in col.get("documents", []):
                    documents.append({
                        "id": doc["id"], "name": doc["name"], "docType": doc.get("docType", "study"),
                        "status": self.status(_key_for({"type": "document", "id": doc["id"]})),
                    })
                collections.append({
                    "id": col["id"], "name": col["name"], "kind": col.get("kind", "course"),
                    "documents": documents,
                    "status": self.status(_key_for({"type": "collection", "id": col["id"]})),
                })
            libraries.append({
                "id": lib["id"], "name": lib["name"],
                "collections": collections,
                "status": self.status(_key_for({"type": "library", "id": lib["id"]})),
            })
        symlinks = []
        if self.symlink is not None:
            for m in self.symlink.list_mounts():
                symlinks.append({
                    "id": m["id"], "name": m["name"], "root": m.get("root", ""),
                    "type": m.get("type", "dir"),
                    "status": self.status(_key_for({"type": "symlink", "id": m["id"]})),
                })
        return {"libraries": libraries, "symlinks": symlinks,
                "sourceTypes": self._source_type_meta()}

    def _source_type_meta(self) -> dict:
        """挂载类数据源元数据：label / 链接模板来自能力提供方（软链接插件）的声明，不写死描述。"""
        cap = manager.capability("symlink.mounts") if self.symlink is not None else None
        if cap is None:
            return {}
        return {
            "symlink": {
                "available": True,
                "label": cap.get("sourceTypeLabel", "本机目录"),
                "linkTemplate": cap.get("linkTemplate", "/files?mount={mountId}"),
            }
        }

    def _symlink_link(self, mount_id: str, rel: str) -> dict:
        """挂载类源跳转链接：href 由能力元数据声明的模板填充，不写死跳转路径。"""
        cap = manager.capability("symlink.mounts") or {}
        template = cap.get("linkTemplate", "/files?mount={mountId}")
        return {
            "kind": "symlink",
            "mountId": mount_id,
            "path": rel,
            "href": template.format(mountId=mount_id),
        }

    def symlink_tree(self, mount_id: str, rel: str = "") -> dict:
        """浏览软链接挂载内目录（代理软链接插件的目录列表能力）。"""
        if self.symlink is None:
            raise KeyError("软链接插件未启用，无法浏览本机目录")
        return self.symlink.list_dir(mount_id, rel or "")

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

    def _symlink_text_files(self, mount: dict, rel: str) -> list[Path]:
        """软链接目标路径下的文本文件列表（rel 为空 = 整个挂载根；支持目录递归与单文件）。"""
        root = Path(mount["root"])
        rel = (rel or "").strip().replace("\\", "/").strip("/")
        target = root if not rel else (root / rel)
        # 路径安全：必须落在挂载根内
        try:
            resolved_root = root.resolve()
            resolved_target = target.resolve()
        except OSError:
            return []
        if not resolved_target.is_relative_to(resolved_root):
            raise ValueError("路径超出挂载根范围")
        if not resolved_target.exists():
            raise KeyError(f"路径不存在: {rel}")
        if resolved_target.is_file():
            return [resolved_target] if resolved_target.suffix.lower() in TEXT_EXTENSIONS else []
        return sorted(
            p for p in resolved_target.rglob("*")
            if p.is_file() and p.suffix.lower() in TEXT_EXTENSIONS
        )

    def _collect_texts(self, source: dict) -> list[dict]:
        """把数据源转成检索单元列表：[{sectionId, sectionName, docId, docName, collectionName, collectionId, link, text}]。"""
        rows: list[dict] = []
        t = source["type"]

        if t in ("library", "collection", "document"):
            if t == "library":
                try:
                    lib = self.store.get_library(source["id"])
                except KeyError:
                    raise KeyError(f"库不存在: {source['id']}")
                collections = lib.get("collections", [])
            else:
                target_cid = source["id"] if t == "collection" else None
                target_did = source["id"] if t == "document" else None
                collections = []
                for lib in self.store.list_libraries():
                    info = self.store.get_library(lib["id"])
                    for col in info.get("collections", []):
                        if t == "collection" and col["id"] != target_cid:
                            continue
                        if t == "document":
                            collections.append({"col": col, "docs": [d for d in col.get("documents", [])
                                                                     if d["id"] == target_did]})
                        else:
                            collections.append({"col": col, "docs": col.get("documents", [])})
                # 扁平化为 (col, doc) 迭代
                for item in collections:
                    for doc in item["docs"]:
                        for sec in doc.get("sections", []):
                            text = self._section_text(doc, sec)
                            rows.append({
                                "sectionId": sec["id"],
                                "sectionName": sec["name"],
                                "docId": doc["id"],
                                "docName": doc["name"],
                                "collectionName": item["col"]["name"],
                                "collectionId": item["col"]["id"],
                                "link": {"kind": "learn", "collectionId": item["col"]["id"], "sectionId": sec["id"]},
                                "text": text,
                            })
                return rows

            for col in collections:
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

        elif t == "symlink":
            if self.symlink is None:
                raise KeyError("软链接插件未启用，无法索引本机目录")
            mount = self.symlink.get_mount(source["id"])
            root = Path(mount["root"])
            try:
                files = self._symlink_text_files(mount, source.get("path") or "")
            except KeyError as e:
                raise KeyError(str(e))
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
                        "link": self._symlink_link(mount["id"], rel),
                        "text": text,
                    })
        else:
            raise ValueError(f"未知数据源类型: {t}")
        return rows

    # ---------------- 索引（后台线程 + 进度） ----------------

    def _paths(self, key: str) -> tuple[Path, Path]:
        d = self.data_dir / key
        return d / "vectors.npy", d / "meta.json"

    def status(self, key: str) -> dict:
        vec_path, meta_path = self._paths(key)
        st: dict = {"indexed": False, "sectionCount": 0}
        if vec_path.exists() and meta_path.exists():
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
            st = {"indexed": True, "sectionCount": len(meta.get("sections", [])),
                  "vectorDim": meta.get("vectorDim"), "updatedAt": meta.get("updatedAt")}
        task = self._tasks.get(key)
        if task and task.get("status") == "running":
            st["running"] = True
            st["total"] = task.get("total", 0)
            st["done"] = task.get("done", 0)
        elif task and task.get("status") == "error":
            st["error"] = task.get("error")
        return st

    def start_index(self, sources: list[dict]) -> list[str]:
        """异步启动对多个数据源的索引（后台线程），返回本次实际启动的 key 列表。

        先同步校验数据源（存在性 / 路径安全），校验失败立即抛出（KeyError/ValueError）。
        """
        self._validate_sources(sources)
        todo = []
        keys = []
        for s in sources:
            key = _key_for(s)
            if self._tasks.get(key, {}).get("status") == "running":
                continue
            self._tasks[key] = {"status": "running", "total": 0, "done": 0}
            todo.append({"source": s, "key": key})
            keys.append(key)
        if todo:
            thread = threading.Thread(target=self._run_index_thread, args=(todo,), daemon=True)
            thread.start()
        return keys

    def _validate_sources(self, sources: list[dict]) -> None:
        """同步校验：库/文档集/文档存在性、软链接挂载与路径安全（防路径穿越）。"""
        for s in sources:
            t = s["type"]
            if t == "library":
                self.store.get_library(s["id"])
            elif t in ("collection", "document"):
                found = False
                for lib in self.store.list_libraries():
                    info = self.store.get_library(lib["id"])
                    for col in info.get("collections", []):
                        if t == "collection":
                            if col["id"] == s["id"]:
                                found = True
                        else:
                            for d in col.get("documents", []):
                                if d["id"] == s["id"]:
                                    found = True
                if not found:
                    raise KeyError(f"{'文档集' if t == 'collection' else '文档'}不存在: {s['id']}")
            elif t == "symlink":
                if self.symlink is None:
                    raise KeyError("软链接插件未启用，无法索引本机目录")
                mount = self.symlink.get_mount(s["id"])
                self._symlink_text_files(mount, s.get("path") or "")
            else:
                raise ValueError(f"未知数据源类型: {t}")

    def _run_index_thread(self, todo: list[dict]) -> None:
        asyncio.run(self._run_index(todo))

    async def _run_index(self, todo: list[dict]) -> None:
        for item in todo:
            key = item["key"]
            try:
                await self.index_source(item["source"], key)
                self._tasks[key] = {"status": "done", "total": 0, "done": 0}
            except Exception as e:  # noqa: BLE001 进度记录吞掉异常，错误经 status 暴露
                self._tasks[key] = {"status": "error", "error": str(e)}

    async def index_source(self, source: dict, key: Optional[str] = None) -> dict:
        """对单个数据源建立/更新向量索引（同步执行，供内部与测试直接调用）。"""
        key = key or _key_for(source)
        rows = self._collect_texts(source)
        if not rows:
            raise RuntimeError("该数据源没有可索引的内容")

        texts = [r["text"] for r in rows]
        vectors: list[list[float]] = []
        total = len(texts)
        self._tasks.setdefault(key, {"status": "running", "total": total, "done": 0})
        self._tasks[key]["total"] = total
        for i in range(0, len(texts), EMBED_BATCH):
            batch = texts[i:i + EMBED_BATCH]
            vectors.extend(await self.gateway.embed(batch, plugin="ai_insight"))
            self._tasks[key]["done"] = min(i + len(batch), total)

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
        d = self.data_dir / key
        d.mkdir(parents=True, exist_ok=True)
        np.save(d / "vectors.npy", arr)
        (d / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
        return {"indexed": True, "sectionCount": len(rows), "vectorDim": int(arr.shape[1]),
                "source": source}

    # ---------------- 检索 ----------------

    def _load_index(self, key: str) -> tuple[np.ndarray, dict]:
        vec_path, meta_path = self._paths(key)
        if not (vec_path.exists() and meta_path.exists()):
            raise NotIndexedError([key])
        return np.load(vec_path), json.loads(meta_path.read_text(encoding="utf-8"))

    def _ensure_indexed(self, sources: list[dict]) -> list[str]:
        """返回未索引的 key 列表（空 = 全部已索引）。"""
        missing = []
        for s in sources:
            key = _key_for(s)
            vec_path, _ = self._paths(key)
            if not vec_path.exists():
                missing.append(key)
        return missing

    async def _retrieve(self, sources: list[dict], question: str, top_k: int) -> list[dict]:
        """多数据源合并向量检索，返回排序后的来源列表（含 score 与 excerpt）。"""
        missing = self._ensure_indexed(sources)
        if missing:
            raise NotIndexedError(missing)

        all_vectors: list[np.ndarray] = []
        all_sections: list[dict] = []
        for s in sources:
            vectors, meta = self._load_index(_key_for(s))
            if len(meta.get("sections", [])) == 0:
                continue
            all_vectors.append(vectors)
            all_sections.extend(meta["sections"])
        if not all_vectors:
            raise RuntimeError("所选数据源索引均为空，请先建立索引")

        combined = np.vstack(all_vectors)
        q = (await self.gateway.embed([question], plugin="ai_insight"))[0]
        q = np.asarray(q, dtype=np.float32)
        sims = combined @ q
        k = min(top_k, len(all_sections))
        top_idx = np.argsort(-sims)[:k].tolist()

        out = []
        for i in top_idx:
            s = all_sections[i]
            out.append({**s, "score": round(float(sims[i]), 4)})
        return out

    # ---------------- 多模式对话 ----------------

    def _context_text(self, hits: list[dict]) -> str:
        """把检索命中拼成 [来源N] 上下文（总量受限，按排名截断）。"""
        lines = []
        used = 0
        for n, s in enumerate(hits, start=1):
            line = (f"[来源{n}] 数据源《{s['collectionName']}》文档《{s['docName']}》"
                    f"内容“{s['sectionName']}”：\n{s['excerpt']}")
            used += len(line)
            if used > MAX_CONTEXT_CHARS:
                break
            lines.append(line)
        return "\n\n".join(lines)

    async def ask(self, sources: list[dict], mode: str, question: str,
                  history: Optional[list[dict]] = None, top_k: int = TOP_K) -> dict:
        """按思考模式对已索引数据源检索并对话（多轮 history 原样透传，仅最新问题参与检索）。"""
        if mode not in MODE_PROMPTS:
            raise ValueError(f"未知思考模式: {mode}")
        if not sources:
            raise RuntimeError("请至少选择一个数据源")
        if not question.strip():
            raise RuntimeError("问题不能为空")

        hits = await self._retrieve(sources, question, top_k)
        context = self._context_text(hits)
        system = MODE_PROMPTS[mode]
        user_msg = (f"{context}\n\n问题：{question}\n\n"
                    "要求：用中文作答；需要引用资料处用 [来源N] 标注；回答末尾列出引用的来源编号。")

        messages: list[dict] = [{"role": "system", "content": system}]
        for h in (history or [])[-10:]:
            role = h.get("role")
            if role in ("user", "assistant") and isinstance(h.get("content"), str):
                messages.append({"role": role, "content": h["content"]})
        messages.append({"role": "user", "content": user_msg})

        result = await self.gateway.chat(messages, temperature=0.4, max_tokens=1536, plugin="ai_insight")
        return {"answer": result["content"], "sources": hits}

    # ---------------- 洞察规划（多轮 agent + 生成） ----------------

    async def plan(self, sources: list[dict], question: str, output: str = "canvas",
                   library_id: Optional[str] = None, top_k: int = PLAN_TOP_K) -> dict:
        """多轮 agent 推理：分析联系 → 批判反思 → 生成目标结构（canvas / course），并创建到库。"""
        if output not in ("canvas", "course"):
            raise ValueError(f"未知生成类型: {output}")
        if not sources:
            raise RuntimeError("请至少选择一个数据源")
        if not question.strip():
            raise RuntimeError("目标不能为空")

        hits = await self._retrieve(sources, question, top_k)
        context = self._context_text(hits)

        # Round 1：主题与联系分析
        r1 = await self.gateway.chat([
            {"role": "system", "content": (
                "你是 AI 洞察规划引擎。请分析下面资料之间的联系，形成一份主题洞察规划。"
                "只依据给定资料，不要编造资料中没有的事实。"
                "输出 JSON（不要 markdown 包裹）："
                '{"theme": "主题名称", "summary": "对资料核心联系的一段总结（200字内）", '
                '"keyPoints": ["关键要点1", ...], '
                '"relations": [{"a": "概念A", "b": "概念B", "relation": "联系描述"}], '
                '"outline": ["可教学的知识点标题1", ...]}'
            )},
            {"role": "user", "content": f"{context}\n\n用户目标：{question}"},
        ], temperature=0.3, max_tokens=1600, response_format={"type": "json_object"}, plugin="ai_insight")
        plan1 = _extract_json(r1["content"])

        # Round 2：批判反思，补充遗漏
        r2 = await self.gateway.chat([
            {"role": "system", "content": (
                "你是批判性审阅者。以下是第一轮形成的洞察规划。请以批判性视角结合资料审视，"
                "指出遗漏的联系、可补充的关键点或需要修正的地方。"
                "输出 JSON："
                '{"revisions": [{"target": "要修正/补充的项", "change": "如何修正"}], '
                '"extraPoints": ["补充要点1", ...]}'
            )},
            {"role": "user", "content": (
                f"第一轮规划：\n{json.dumps(plan1, ensure_ascii=False, indent=2)}\n\n资料：\n{context}"
            )},
        ], temperature=0.3, max_tokens=1200, response_format={"type": "json_object"}, plugin="ai_insight")
        plan2 = _extract_json(r2["content"])

        merged = {"plan": plan1, "review": plan2, "question": question, "context": context}
        if output == "canvas":
            return await self._generate_canvas(merged, library_id)
        return await self._generate_course(merged, library_id)

    async def _generate_canvas(self, merged: dict, library_id: Optional[str]) -> dict:
        plan1, plan2, question, context = merged["plan"], merged["review"], merged["question"], merged["context"]
        r = await self.gateway.chat([
            {"role": "system", "content": (
                "你是知识图表设计师。请根据洞察规划生成一张知识图表（canvas），用于直观展示概念与联系。"
                "节点用 text 类型表达概念，连线表达关系。"
                "坐标约定：画布 8000x8000；文字节点建议 width 240、height 90；x、y 用整数并合理排布避免重叠；"
                f"颜色可选 {CANVAS_COLORS} 之一。"
                "输出 JSON（不要 markdown 包裹）："
                '{"name": "图表名称", '
                '"nodes": [{"id": "n1", "type": "text", "x": 100, "y": 100, "width": 240, "height": 90, '
                '"text": "概念", "color": "#3b82f6"}], '
                '"edges": [{"id": "e1", "fromNode": "n1", "toNode": "n2", "label": "关系", "toEnd": "arrow"}]}'
            )},
            {"role": "user", "content": (
                f"洞察规划：\n{json.dumps(merged, ensure_ascii=False, indent=2)[:14000]}"
                f"\n\n资料：\n{context[:16000]}"
            )},
        ], temperature=0.4, max_tokens=4000, response_format={"type": "json_object"}, plugin="ai_insight")
        data = _extract_json(r["content"])

        name = str(data.get("name") or plan1.get("theme") or "AI 洞察图表").strip()[:100]
        nodes = self._sanitize_canvas_nodes(data.get("nodes") or [])
        edges = self._sanitize_canvas_edges(data.get("edges") or [], nodes)

        lib_id = self._pick_library(library_id)
        col = self.store.create_collection(lib_id, {"name": name, "kind": "canvas", "description": question})
        self.store.update_collection(col["id"], {"canvas": {"nodes": nodes, "edges": edges}})
        return {"kind": "canvas", "collectionId": col["id"], "collectionName": name,
                "libraryId": lib_id, "summary": plan1.get("summary", "")}

    async def _generate_course(self, merged: dict, library_id: Optional[str]) -> dict:
        plan1, plan2, question, context = merged["plan"], merged["review"], merged["question"], merged["context"]
        r = await self.gateway.chat([
            {"role": "system", "content": (
                "你是课程设计师。请根据洞察规划生成一门微课程（文档结构），用于循序渐进地教学用户。"
                "块类型仅使用 markdown（content 为 Markdown 文本，可含 # 标题、列表、表格、示例代码）。"
                "每章 2-4 个知识点；内容准确、讲解清晰、包含示例；知识点之间体现资料中的联系。"
                "输出 JSON（不要 markdown 包裹）："
                '{"name": "课程名称", "description": "课程简介", '
                '"documents": [{"name": "章节名", "docType": "study", '
                '"sections": [{"name": "知识点名", '
                '"blocks": [{"type": "markdown", "content": "# 知识点标题\\n\\n正文"}]}]}]}'
            )},
            {"role": "user", "content": (
                f"洞察规划：\n{json.dumps(merged, ensure_ascii=False, indent=2)[:14000]}"
                f"\n\n资料：\n{context[:16000]}"
            )},
        ], temperature=0.4, max_tokens=5000, response_format={"type": "json_object"}, plugin="ai_insight")
        data = _extract_json(r["content"])

        name = str(data.get("name") or plan1.get("theme") or "AI 洞察课程").strip()[:100]
        lib_id = self._pick_library(library_id)
        col = self.store.create_collection(lib_id, {
            "name": name, "kind": "course", "description": data.get("description") or question,
        })
        documents = data.get("documents") or []
        if not documents:
            # 兜底：用规划大纲生成单章
            docs = [{"name": "第 1 章 核心概念", "docType": "study",
                     "sections": [{"name": s, "blocks": [{"type": "markdown",
                                                          "content": f"# {s}\n\n详见资料与洞察规划。", }]}
                                  for s in (plan1.get("outline") or [])[:6]]}]
            documents = docs
        created = 0
        for d in documents[:10]:
            doc_name = str(d.get("name") or "章节").strip()[:100]
            doc = self.store.create_document(col["id"], {"name": doc_name, "docType": d.get("docType") or "study"})
            for sec in (d.get("sections") or [])[:12]:
                sec_name = str(sec.get("name") or "知识点").strip()[:100]
                section = self.store.create_section(doc["id"], {"name": sec_name})
                for b in (sec.get("blocks") or [])[:20]:
                    if b.get("type") != "markdown" or not str(b.get("content") or "").strip():
                        continue
                    self.store.add_block(section["id"], {"type": "markdown", "content": str(b["content"])})
                    created += 1
        return {"kind": "course", "collectionId": col["id"], "collectionName": name,
                "libraryId": lib_id, "summary": plan1.get("summary", "")}

    def _pick_library(self, library_id: Optional[str]) -> str:
        if library_id:
            return library_id
        libs = self.store.list_libraries()
        if not libs:
            raise RuntimeError("未指定目标库，且当前无可用库")
        return libs[0]["id"]

    def _sanitize_canvas_nodes(self, nodes: list) -> list[dict]:
        """清洗 AI 生成的画布节点：保证必填字段与唯一 id。"""
        out: list[dict] = []
        seen: set[str] = set()
        for i, n in enumerate(nodes):
            if not isinstance(n, dict):
                continue
            nid = str(n.get("id") or f"n{i}")
            while nid in seen:
                nid = f"{nid}_{i}"
            seen.add(nid)
            node_type = n.get("type") if n.get("type") in ("text", "file", "link", "group") else "text"
            node = {
                "id": nid, "type": node_type,
                "x": int(n.get("x") or 0), "y": int(n.get("y") or 0),
                "width": int(n.get("width") or (240 if node_type == "text" else 200)),
                "height": int(n.get("height") or 90),
            }
            color = n.get("color")
            if isinstance(color, str) and color.startswith("#") and len(color) == 7:
                node["color"] = color
            if node_type == "text" and n.get("text"):
                node["text"] = str(n["text"])[:500]
            elif node_type == "file" and n.get("file"):
                node["file"] = str(n["file"])
            elif node_type == "link" and n.get("url"):
                node["url"] = str(n["url"])
            elif node_type == "group" and n.get("label"):
                node["label"] = str(n["label"])
            out.append(node)
        return out

    def _sanitize_canvas_edges(self, edges: list, nodes: list[dict]) -> list[dict]:
        node_ids = {n["id"] for n in nodes}
        out: list[dict] = []
        for i, e in enumerate(edges):
            if not isinstance(e, dict):
                continue
            from_node, to_node = e.get("fromNode"), e.get("toNode")
            if from_node not in node_ids or to_node not in node_ids:
                continue
            edge = {"id": str(e.get("id") or f"e{i}"), "fromNode": from_node, "toNode": to_node}
            if e.get("label"):
                edge["label"] = str(e["label"])[:100]
            if e.get("color"):
                edge["color"] = str(e["color"])
            if e.get("toEnd") in ("none", "arrow"):
                edge["toEnd"] = e["toEnd"]
            out.append(edge)
        return out
