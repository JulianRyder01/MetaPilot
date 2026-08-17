"""本地存储层（库文件为 .mpf 格式）。

布局（data_dir）:
  index.json              库摘要列表
  libraries/{id}.mpf      每个库的完整内容树（.mpf doc 类型，兼容旧 .json 自动迁移）
  progress.json           学习进度（每课程独立）
  stats.json              学习时长会话
  assets/{cid}/           课程包资产（interactives 等）
  kb/                     知识库向量索引
"""
from __future__ import annotations

import json
import shutil
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from ..services import mpf as mpf_service


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def gen_id() -> str:
    return uuid.uuid4().hex[:12]


def _read_json(path: Path, default: Any):
    if not path.exists():
        return default
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def _write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    tmp.replace(path)


# ---------------- 树内定位工具 ----------------

def _folders(lib: dict) -> list:
    """库内顶层文件夹列表（新键 folders；旧 .mpf/.json 的 collections 键读取兼容）。"""
    folders = lib.get("folders")
    if folders is None:
        folders = lib.get("collections", [])
    return folders


def find_folder(lib: dict, fid: str) -> Optional[dict]:
    for f in _folders(lib):
        if f["id"] == fid:
            return f
    return None


def find_document(lib: dict, did: str) -> tuple[Optional[dict], Optional[dict]]:
    for f in _folders(lib):
        for d in f.get("documents", []):
            if d["id"] == did:
                return f, d
    return None, None


def find_section(lib: dict, sid: str) -> tuple[Optional[dict], Optional[dict], Optional[dict]]:
    for f in _folders(lib):
        for d in f.get("documents", []):
            for s in d.get("sections", []):
                if s["id"] == sid:
                    return f, d, s
    return None, None, None


def find_block(lib: dict, bid: str) -> tuple[Optional[dict], Optional[dict], Optional[dict], Optional[dict]]:
    for f in _folders(lib):
        for d in f.get("documents", []):
            for s in d.get("sections", []):
                for b in s.get("blocks", []):
                    if b["id"] == bid:
                        return f, d, s, b
    return None, None, None, None


# ---------------- 库存储 ----------------

class LibraryStore:
    def __init__(self, data_dir: str | Path):
        self.root = Path(data_dir)
        self.libs_dir = self.root / "libraries"
        self.index_path = self.root / "index.json"
        self.libs_dir.mkdir(parents=True, exist_ok=True)
        self.lock = threading.Lock()
        if not self.index_path.exists():
            _write_json(self.index_path, {"libraries": []})

    # ---- 内部 ----
    def _load_index(self) -> list[dict]:
        return _read_json(self.index_path, {"libraries": []})["libraries"]

    def _save_index(self, items: list[dict]) -> None:
        _write_json(self.index_path, {"libraries": items})

    def _lib_path(self, lid: str) -> Path:
        return self.libs_dir / f"{lid}.mpf"

    def _load_lib(self, lid: str) -> dict:
        mpf_path = self._lib_path(lid)
        json_path = self.libs_dir / f"{lid}.json"
        if mpf_path.exists():
            parsed = mpf_service.parse_mpf(mpf_path.read_text(encoding="utf-8"))
            if not parsed["ok"]:
                raise KeyError(f"库文件损坏: {lid}: {'; '.join(parsed['errors'])}")
            meta = parsed["meta"]
            lib = {
                "id": lid,
                "name": meta["name"],
                "description": meta["description"],
                "createdAt": meta.get("createdAt") or now_iso(),
                "updatedAt": meta.get("updatedAt") or now_iso(),
                "folders": parsed["content"].get("folders") or parsed["content"].get("collections") or [],
            }
            # 置顶标记存索引摘要（index.json），不进入 .mpf 内容
            for it in self._load_index():
                if it["id"] == lid:
                    lib["pinned"] = bool(it.get("pinned"))
                    break
            lib["isDefault"] = self.is_default_target("library", lid)
            return lib
        if json_path.exists():
            # 旧 .json 格式：读取并自动迁移为 .mpf
            lib = _read_json(json_path, None)
            if lib is not None:
                self._save_lib(lib)
                return lib
        raise KeyError(f"库不存在: {lid}")

    def _save_lib(self, lib: dict) -> None:
        doc = {
            "type": "doc",
            "id": lib["id"],
            "name": lib.get("name", ""),
            "description": lib.get("description", ""),
            "createdAt": lib.get("createdAt", ""),
            "updatedAt": lib.get("updatedAt", ""),
            "folders": _folders(lib),
        }
        mpf_path = self._lib_path(lib["id"])
        mpf_path.write_text(mpf_service.serialize_mpf(doc), encoding="utf-8")
        self._refresh_index_item(lib)

    def _refresh_index_item(self, lib: dict) -> None:
        items = self._load_index()
        entry = {
            "id": lib["id"],
            "name": lib["name"],
            "description": lib.get("description", ""),
            "updatedAt": lib.get("updatedAt"),
            "pinned": bool(lib.get("pinned")),
            "isDefault": self.is_default_target("library", lib["id"]),
            "folderCount": len(_folders(lib)),
            "folders": [
                {"id": f["id"], "name": f["name"], "kind": f.get("kind", "note")}
                for f in _folders(lib)
            ],
        }
        for i, it in enumerate(items):
            if it["id"] == lib["id"]:
                items[i] = entry
                break
        else:
            items.append(entry)
        self._save_index(items)

    # ---- 库级 ----
    def list_libraries(self) -> list[dict]:
        """库摘要列表：默认且置顶 → 最前；置顶 → 其次；默认（未置顶）→ 紧随置顶组；其余保持创建顺序。

        isDefault 实时从默认保存目标派生（index 缓存中的旧值可能过期，不依赖）。
        """
        items = self._load_index()
        dt = self.get_default_target()
        default_id = dt.get("id") if dt.get("kind") == "library" else None
        for it in items:
            it["isDefault"] = it["id"] == default_id

        def sort_key(it: dict) -> int:
            pinned = bool(it.get("pinned"))
            is_default = bool(it.get("isDefault"))
            return 0 if (pinned and is_default) else (1 if pinned else (2 if is_default else 3))

        return sorted(items, key=sort_key)

    def get_library(self, lid: str) -> dict:
        return self._load_lib(lid)

    def create_library(self, name: str, description: str = "") -> dict:
        with self.lock:
            lib = {
                "id": gen_id(),
                "name": name,
                "description": description,
                "pinned": False,
                "isDefault": False,
                "createdAt": now_iso(),
                "updatedAt": now_iso(),
                "folders": [],
            }
            self._save_lib(lib)
            return lib

    def update_library(self, lid: str, name: Optional[str] = None, description: Optional[str] = None,
                       pinned: Optional[bool] = None) -> dict:
        with self.lock:
            lib = self._load_lib(lid)
            if name is not None:
                lib["name"] = name
            if description is not None:
                lib["description"] = description
            if pinned is not None:
                lib["pinned"] = bool(pinned)
            lib["updatedAt"] = now_iso()
            self._save_lib(lib)
            return lib

    # ---- 默认保存目标（库 / 软链接统一，唯一） ----

    def get_default_target(self) -> dict:
        """全局默认保存目标：{kind: library|symlink, id}；未设置时为空串。"""
        return _read_json(self.root / "default_target.json", {"kind": "", "id": ""})

    def set_default_target(self, kind: str, target_id: str) -> dict:
        """设置默认保存目标（唯一）：库或软链接都经此登记，AI 洞察等插件读取。"""
        entry = {"kind": kind, "id": target_id}
        _write_json(self.root / "default_target.json", entry)
        return entry

    def is_default_target(self, kind: str, target_id: str) -> bool:
        t = self.get_default_target()
        return t.get("kind") == kind and t.get("id") == target_id

    def clear_default_target(self, kind: str, target_id: str) -> dict:
        """目标被删除/取消默认时清除其默认标记（避免悬空）；返回清除后的默认保存目标。"""
        if self.is_default_target(kind, target_id):
            return self.set_default_target("", "")
        return self.get_default_target()

    def set_default_library(self, lid: str) -> dict:
        """把指定库设为默认保存目标（唯一），并返回库信息。"""
        with self.lock:
            self._load_lib(lid)  # 确认存在
            self.set_default_target("library", lid)
            return self._load_lib(lid)

    def delete_library(self, lid: str) -> None:
        with self.lock:
            # 清理该库下所有图表的 .canvas 文件
            try:
                lib = self._load_lib(lid)
                for fld in _folders(lib):
                    if fld.get("kind") == "canvas":
                        self._canvas_path(fld["id"]).unlink(missing_ok=True)
            except KeyError:
                pass
            path = self._lib_path(lid)
            if path.exists():
                path.unlink()
            old = self.libs_dir / f"{lid}.json"
            if old.exists():
                old.unlink()
            items = [it for it in self._load_index() if it["id"] != lid]
            self._save_index(items)
            # 若删除的是默认保存目标，清除默认标记
            self.clear_default_target("library", lid)

    # ---- 顶层文件夹（原文档集：课程/图表/笔记等） ----
    def create_folder(self, lid: str, data: dict) -> dict:
        with self.lock:
            lib = self._load_lib(lid)
            folder = {
                "id": gen_id(),
                "name": data["name"],
                "kind": data.get("kind", "note"),
                "description": data.get("description", ""),
                "author": data.get("author", ""),
                "version": data.get("version", "1.0.0"),
                "formatVersion": data.get("formatVersion", 1),
                "packageId": data.get("packageId", ""),
                "createdAt": now_iso(),
                "updatedAt": now_iso(),
                "documents": [],
                "folders": [],
                "canvas": {"nodes": [], "edges": []} if data.get("kind") == "canvas" else None,
            }
            lib.setdefault("folders", []).append(folder)
            lib["updatedAt"] = now_iso()
            self._save_lib(lib)
            return folder

    def update_folder(self, fid: str, data: dict) -> dict:
        with self.lock:
            for lib in self._iter_all_libs():
                fld = find_folder(lib, fid)
                if fld is None:
                    continue
                for key in ("name", "kind", "description", "author", "version", "packageId", "formatVersion", "canvas",
                            # 通用转换标记：文件夹由其它类型转换而来（如文档 → 课程），供任何插件/核心读取
                            "convertedFrom", "convertedAt"):
                    if key in data and data[key] is not None:
                        fld[key] = data[key]
                fld["updatedAt"] = now_iso()
                lib["updatedAt"] = now_iso()
                self._save_lib(lib)
                # 图表保存时同步落盘 Obsidian 原生 .canvas 文件（与 .mpf 兼容双向）
                if data.get("canvas") is not None and fld.get("kind") == "canvas":
                    self._save_canvas_file(fid, data["canvas"])
                return fld

    # ---- 图表 .canvas 文件（Obsidian 兼容：保存/导入同步写回原生 .canvas） ----

    def _canvas_path(self, fid: str) -> Path:
        return self.root / "canvases" / f"{fid}.canvas"

    def _save_canvas_file(self, fid: str, canvas: dict) -> None:
        path = self._canvas_path(fid)
        path.parent.mkdir(parents=True, exist_ok=True)
        _write_json(path, {
            "nodes": canvas.get("nodes", []),
            "edges": canvas.get("edges", []),
        })

    def delete_folder(self, fid: str) -> None:
        with self.lock:
            for lib in self._iter_all_libs():
                folders = lib.setdefault("folders", [])
                for i, fld in enumerate(folders):
                    if fld["id"] == fid:
                        del folders[i]
                        lib["updatedAt"] = now_iso()
                        self._save_lib(lib)
                        self._canvas_path(fid).unlink(missing_ok=True)
                        return
            raise KeyError(f"文件夹不存在: {fid}")

    def get_folder_any(self, fid: str) -> dict:
        """统一获取文件夹：顶层返回全量；嵌套返回其基本信息。"""
        for lib in self._iter_all_libs():
            fld = find_folder(lib, fid)
            if fld is not None:
                return fld
            owner = self._find_owner_folder(fid, lib)
            if owner is not None:
                folder = next((x for x in owner.get("folders", []) if x["id"] == fid), None)
                return {"id": folder["id"], "name": folder["name"],
                        "parentId": folder.get("parentId", "")}
        raise KeyError(f"文件夹不存在: {fid}")

    def update_folder_any(self, fid: str, data: dict) -> dict:
        """统一更新：顶层或嵌套文件夹（先顶层后嵌套）。"""
        for lib in self._iter_all_libs():
            if find_folder(lib, fid) is not None:
                return self.update_folder(fid, data)
        return self.update_subfolder(fid, data)

    def delete_folder_any(self, fid: str) -> None:
        """统一删除：顶层或嵌套文件夹（先顶层后嵌套）。"""
        for lib in self._iter_all_libs():
            if find_folder(lib, fid) is not None:
                self.delete_folder(fid)
                return
        self.delete_subfolder(fid)

    def _iter_all_libs(self):
        for it in self._load_index():
            yield self._load_lib(it["id"])

    # ---- 嵌套文件夹（顶层文件夹内的目录层级） ----

    def _folder_tree(self, fld: dict) -> dict[str, dict]:
        """返回 folderId -> folder 的映射（fld 为顶层文件夹）。"""
        return {f["id"]: f for f in fld.get("folders", [])}

    def _folder_descendants(self, fld: dict, fid: str) -> set[str]:
        """返回 fid 及其全部子孙文件夹 id。"""
        tree = self._folder_tree(fld)
        out: set[str] = set()
        stack = [fid]
        while stack:
            cur = stack.pop()
            if cur in out:
                continue
            out.add(cur)
            for f in tree.values():
                if f.get("parentId") == cur:
                    stack.append(f["id"])
        return out

    def create_subfolder(self, fid: str, data: dict) -> dict:
        with self.lock:
            for lib in self._iter_all_libs():
                fld = find_folder(lib, fid)
                if fld is None:
                    continue
                parent_id = data.get("parentId", "")
                if parent_id:
                    tree = self._folder_tree(fld)
                    if parent_id not in tree:
                        raise KeyError(f"父文件夹不存在: {parent_id}")
                folder = {
                    "id": gen_id(),
                    "name": data["name"],
                    "parentId": parent_id,
                    "createdAt": now_iso(),
                }
                fld.setdefault("folders", []).append(folder)
                fld["updatedAt"] = now_iso()
                lib["updatedAt"] = now_iso()
                self._save_lib(lib)
                return folder
            raise KeyError(f"文件夹不存在: {fid}")

    def update_subfolder(self, fid: str, data: dict) -> dict:
        with self.lock:
            for lib in self._iter_all_libs():
                fld = self._find_owner_folder(fid, lib)
                if fld is None:
                    continue
                folder = next((f for f in fld.get("folders", []) if f["id"] == fid), None)
                if folder is None:
                    raise KeyError(f"文件夹不存在: {fid}")
                if "name" in data and data["name"] is not None:
                    folder["name"] = data["name"]
                if "parentId" in data:
                    new_parent = data["parentId"] or ""
                    # 防环：父不能是自身或其后代
                    if new_parent == fid:
                        raise ValueError("父文件夹不能是自身")
                    if new_parent:
                        descendants = self._folder_descendants(fld, fid)
                        if new_parent in descendants:
                            raise ValueError("父文件夹不能是其自身的子文件夹")
                        if new_parent not in self._folder_tree(fld):
                            raise KeyError(f"父文件夹不存在: {new_parent}")
                    folder["parentId"] = new_parent
                fld["updatedAt"] = now_iso()
                lib["updatedAt"] = now_iso()
                self._save_lib(lib)
                return folder
            raise KeyError(f"文件夹不存在: {fid}")

    def delete_subfolder(self, fid: str) -> None:
        """删除嵌套文件夹：级联删除其全部子孙文件夹与其中的文档。"""
        with self.lock:
            for lib in self._iter_all_libs():
                fld = self._find_owner_folder(fid, lib)
                if fld is None:
                    raise KeyError(f"文件夹不存在: {fid}")
                doomed = self._folder_descendants(fld, fid)
                fld["folders"] = [f for f in fld.get("folders", []) if f["id"] not in doomed]
                fld["documents"] = [
                    d for d in fld.get("documents", [])
                    if (d.get("folderId") or "") not in doomed
                ]
                fld["updatedAt"] = now_iso()
                lib["updatedAt"] = now_iso()
                self._save_lib(lib)
                return

    @staticmethod
    def _find_owner_folder(fid: str, lib: dict):
        """返回包含嵌套文件夹 fid 的顶层文件夹。"""
        for f in _folders(lib):
            if any(x["id"] == fid for x in f.get("folders", [])):
                return f
        return None

    # ---- 文档 ----
    def create_document(self, fid: str, data: dict) -> dict:
        with self.lock:
            for lib in self._iter_all_libs():
                fld = find_folder(lib, fid)
                if fld is None:
                    continue
                doc = {
                    "id": gen_id(),
                    "name": data["name"],
                    "docType": data.get("docType", "study"),
                    "folderId": data.get("folderId", ""),
                    "createdAt": now_iso(),
                    "updatedAt": now_iso(),
                    "sections": [],
                }
                fld.setdefault("documents", []).append(doc)
                lib["updatedAt"] = now_iso()
                fld["updatedAt"] = now_iso()
                self._save_lib(lib)
                return doc
            raise KeyError(f"文件夹不存在: {fid}")

    def update_document(self, did: str, data: dict) -> dict:
        with self.lock:
            for lib in self._iter_all_libs():
                _, doc = find_document(lib, did)
                if doc is None:
                    continue
                for key in ("name", "docType", "folderId"):
                    if key in data and data[key] is not None:
                        doc[key] = data[key]
                doc["updatedAt"] = now_iso()
                lib["updatedAt"] = now_iso()
                self._save_lib(lib)
                return doc
            raise KeyError(f"文档不存在: {did}")

    def delete_document(self, did: str) -> None:
        with self.lock:
            for lib in self._iter_all_libs():
                col, doc = find_document(lib, did)
                if col is None:
                    continue
                col["documents"] = [d for d in col.get("documents", []) if d["id"] != did]
                col["updatedAt"] = now_iso()
                lib["updatedAt"] = now_iso()
                self._save_lib(lib)
                return
            raise KeyError(f"文档不存在: {did}")

    # ---- 小节（知识点） ----
    def create_section(self, did: str, data: dict) -> dict:
        with self.lock:
            for lib in self._iter_all_libs():
                _, doc = find_document(lib, did)
                if doc is None:
                    continue
                sec = {
                    "id": gen_id(),
                    "name": data["name"],
                    "refDocId": data.get("refDocId", ""),
                    "createdAt": now_iso(),
                    "updatedAt": now_iso(),
                    "blocks": [],
                }
                doc.setdefault("sections", []).append(sec)
                lib["updatedAt"] = now_iso()
                doc["updatedAt"] = now_iso()
                self._save_lib(lib)
                return sec
            raise KeyError(f"文档不存在: {did}")

    def update_section(self, sid: str, data: dict) -> dict:
        with self.lock:
            for lib in self._iter_all_libs():
                _, _, sec = find_section(lib, sid)
                if sec is None:
                    continue
                if "name" in data and data["name"] is not None:
                    sec["name"] = data["name"]
                if "refDocId" in data:
                    sec["refDocId"] = data["refDocId"] or ""
                if "blocks" in data and data["blocks"] is not None:
                    sec["blocks"] = data["blocks"]
                sec["updatedAt"] = now_iso()
                lib["updatedAt"] = now_iso()
                self._save_lib(lib)
                return sec
            raise KeyError(f"小节不存在: {sid}")

    def delete_section(self, sid: str) -> None:
        with self.lock:
            for lib in self._iter_all_libs():
                _, doc, sec = find_section(lib, sid)
                if doc is None:
                    continue
                doc["sections"] = [s for s in doc.get("sections", []) if s["id"] != sid]
                doc["updatedAt"] = now_iso()
                lib["updatedAt"] = now_iso()
                self._save_lib(lib)
                return
            raise KeyError(f"小节不存在: {sid}")

    def reorder_sections(self, did: str, ids: list[str]) -> list[dict]:
        with self.lock:
            for lib in self._iter_all_libs():
                _, doc = find_document(lib, did)
                if doc is None:
                    continue
                by_id = {s["id"]: s for s in doc.get("sections", [])}
                doc["sections"] = [by_id[i] for i in ids if i in by_id]
                lib["updatedAt"] = now_iso()
                self._save_lib(lib)
                return doc["sections"]
            raise KeyError(f"文档不存在: {did}")

    # ---- 块 ----
    def add_block(self, sid: str, data: dict) -> dict:
        with self.lock:
            for lib in self._iter_all_libs():
                _, _, sec = find_section(lib, sid)
                if sec is None:
                    continue
                block = {"id": gen_id(), "type": data["type"]}
                for key in (
                    "content", "question", "options", "answer", "answers",
                    "blanks", "reference", "explanation", "keywords",
                    "ai_graded", "title", "file", "height",
                    # 限时答题模块（交互式学习插件 1.1.0）
                    "timeLimitSec", "hiddenBefore", "autoSubmitOnTimeout", "retryable", "continuePrev",
                    # 动态交互 HTML（mode=dynamic + 情景设定 + 多模态开关）
                    "mode", "scenario", "multimodal",
                    # AI 评判结果（保存于交互块，重做覆盖）
                    "lastResult",
                ):
                    if key in data and data[key] is not None:
                        block[key] = data[key]
                sec.setdefault("blocks", []).append(block)
                lib["updatedAt"] = now_iso()
                sec["updatedAt"] = now_iso()
                self._save_lib(lib)
                return block
            raise KeyError(f"小节不存在: {sid}")

    def update_block(self, bid: str, data: dict) -> dict:
        with self.lock:
            for lib in self._iter_all_libs():
                _, _, _, block = find_block(lib, bid)
                if block is None:
                    continue
                if "type" in data and data["type"] is not None:
                    block["type"] = data["type"]
                for key in (
                    "content", "question", "options", "answer", "answers",
                    "blanks", "reference", "explanation", "keywords",
                    "ai_graded", "title", "file", "height",
                    # 限时答题模块（交互式学习插件 1.1.0）
                    "timeLimitSec", "hiddenBefore", "autoSubmitOnTimeout", "retryable", "continuePrev",
                    # 动态交互 HTML（mode=dynamic + 情景设定 + 多模态开关）
                    "mode", "scenario", "multimodal",
                    # AI 评判结果（保存于交互块，重做覆盖）
                    "lastResult",
                ):
                    if key in data:
                        block[key] = data[key]
                lib["updatedAt"] = now_iso()
                self._save_lib(lib)
                return block
            raise KeyError(f"块不存在: {bid}")

    def delete_block(self, bid: str) -> None:
        with self.lock:
            for lib in self._iter_all_libs():
                _, _, sec, block = find_block(lib, bid)
                if sec is None:
                    continue
                sec["blocks"] = [b for b in sec.get("blocks", []) if b["id"] != bid]
                lib["updatedAt"] = now_iso()
                sec["updatedAt"] = now_iso()
                self._save_lib(lib)
                return
            raise KeyError(f"块不存在: {bid}")

    def reorder_blocks(self, sid: str, ids: list[str]) -> list[dict]:
        with self.lock:
            for lib in self._iter_all_libs():
                _, _, sec = find_section(lib, sid)
                if sec is None:
                    continue
                by_id = {b["id"]: b for b in sec.get("blocks", [])}
                sec["blocks"] = [by_id[i] for i in ids if i in by_id]
                lib["updatedAt"] = now_iso()
                self._save_lib(lib)
                return sec["blocks"]
            raise KeyError(f"小节不存在: {sid}")
