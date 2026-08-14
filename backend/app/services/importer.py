"""课程包导入/导出服务。

课程包格式（zip）：
  manifest.json   课程包元数据 + 完整内容（库/文档集/文档/小节/块）
  interactives/   动态交互块资产（html 等），被 block.file 引用

导入：上传 zip → 解析 manifest → 写入指定库（默认新建库）→ 资产落盘 assets/{cid}/
导出：指定课程 → 生成 manifest + 收集资产 → 打包 zip
"""
from __future__ import annotations

import io
import json
import re
import zipfile
from pathlib import Path
from typing import Optional

from ..services import mpf as mpf_service
from ..storage.store import LibraryStore, find_collection, gen_id, now_iso

FORMAT_VERSION = 1


class CourseImporter:
    def __init__(self, store: LibraryStore, assets_dir: Path):
        self.store = store
        self.assets_dir = Path(assets_dir)
        self.assets_dir.mkdir(parents=True, exist_ok=True)

    # ---------------- 校验 ----------------

    def validate(self, manifest: dict) -> list[str]:
        errors = []
        if not isinstance(manifest, dict):
            return ["manifest 必须是 JSON 对象"]
        if not manifest.get("name"):
            errors.append("缺少课程名 name")
        collections = manifest.get("collections")
        if not isinstance(collections, list) or not collections:
            errors.append("缺少 collections（至少一个文档集）")
        else:
            for col in collections:
                if not col.get("name"):
                    errors.append("存在未命名的文档集")
                for doc in col.get("documents", []):
                    if not doc.get("name"):
                        errors.append("存在未命名的文档（章节）")
                    for sec in doc.get("sections", []):
                        if not sec.get("name"):
                            errors.append("存在未命名的小节（知识点）")
                        for b in sec.get("blocks", []):
                            if b.get("type") == "interactive" and not b.get("file"):
                                errors.append("interactive 块缺少 file 字段")
        return errors

    # ---------------- 导入 ----------------

    def import_package(
        self,
        manifest: dict,
        asset_files: Optional[dict[str, bytes]] = None,
        library_id: str = "",
    ) -> dict:
        errors = self.validate(manifest)
        if errors:
            raise ValueError("课程包校验失败: " + "; ".join(errors))

        asset_files = asset_files or {}
        package_id = manifest.get("id") or gen_id()

        # 目标库
        if library_id:
            lib = self.store.get_library(library_id)
        else:
            lib_name = (manifest.get("library") or {}).get("name") or manifest["name"]
            lib = self.store.create_library(lib_name, (manifest.get("library") or {}).get("description", ""))

        # 若已有同 packageId 的课程则替换
        existing = None
        for col in lib.get("collections", []):
            if col.get("packageId") == package_id:
                existing = col
                break
        if existing:
            self.store.delete_collection(existing["id"])

        created = []
        for col_data in manifest["collections"]:
            col = self.store.create_collection(lib["id"], {
                "name": col_data["name"],
                "kind": col_data.get("kind", "course"),
                "description": col_data.get("description", ""),
                "author": col_data.get("author", manifest.get("author", "")),
                "version": col_data.get("version", manifest.get("version", "1.0.0")),
                "formatVersion": manifest.get("formatVersion", FORMAT_VERSION),
            })
            col["packageId"] = package_id
            self.store.update_collection(col["id"], {"packageId": package_id})
            for doc_data in col_data.get("documents", []):
                doc = self.store.create_document(col["id"], {
                    "name": doc_data["name"],
                    "docType": doc_data.get("docType", "study"),
                })
                for sec_data in doc_data.get("sections", []):
                    sec = self.store.create_section(doc["id"], {"name": sec_data["name"]})
                    for block_data in sec_data.get("blocks", []):
                        self.store.add_block(sec["id"], block_data)
            created.append({"collectionId": col["id"], "name": col["name"]})

        # 资产落盘
        col_dir = self.assets_dir / created[0]["collectionId"]
        for rel, content in asset_files.items():
            target = (col_dir / rel).resolve()
            if not str(target).startswith(str(col_dir.resolve())):
                continue  # 防路径穿越
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(content)

        return {"libraryId": lib["id"], "imported": created, "packageId": package_id}

    def import_zip_bytes(self, data: bytes, library_id: str = "") -> dict:
        try:
            zf = zipfile.ZipFile(io.BytesIO(data))
        except zipfile.BadZipFile:
            raise ValueError("不是有效的 zip 课程包")
        with zf:
            names = zf.namelist()
            manifest_names = [n for n in names if n.endswith("manifest.json")]
            if not manifest_names:
                raise ValueError("课程包缺少 manifest.json")
            manifest = json.loads(zf.read(manifest_names[0]).decode("utf-8"))
            assets = {
                n: zf.read(n)
                for n in names
                if not n.endswith("/") and n != manifest_names[0] and not n.endswith("manifest.json")
            }
        return self.import_package(manifest, assets, library_id)

    # ---------------- MetaPilot 文件（.mpf）导入 / 导出 ----------------

    def import_mpf(self, text: str, library_id: str = "") -> dict:
        """导入 .mpf 文本：doc → 课程/库；canvas → 图表集合。返回含 unresolved 未解析项。"""
        parsed = mpf_service.parse_mpf(text)
        if not parsed["ok"]:
            raise ValueError("; ".join(parsed["errors"]))
        if parsed["type"] == "doc":
            content = parsed["content"]
            manifest = {
                "formatVersion": parsed["meta"]["formatVersion"] or 1,
                "id": f"mpf-{gen_id()}",
                "name": parsed["meta"]["name"] or "导入的内容",
                "author": parsed["meta"]["author"] or "",
                "version": parsed["meta"]["version"] or "1.0.0",
                "description": parsed["meta"]["description"] or "",
                "library": content["library"] or {"name": parsed["meta"]["name"] or "导入的库", "description": ""},
                "collections": content["collections"],
            }
            result = self.import_package(manifest, {}, library_id=library_id)
            result["type"] = "doc"
            result["unresolved"] = parsed["unresolved"]
            return result

        if parsed["type"] == "canvas":
            content = parsed["content"]
            if library_id:
                lib = self.store.get_library(library_id)
            else:
                lib = self.store.create_library("图表", "导入的 .canvas / .mpf 图表")
            col = self.store.create_collection(lib["id"], {
                "name": parsed["meta"]["name"] or "未命名图表",
                "kind": "canvas",
                "description": "由 .mpf/.canvas 导入的图表",
            })
            self.store.update_collection(col["id"], {"canvas": content})
            return {
                "type": "canvas",
                "libraryId": lib["id"],
                "collectionId": col["id"],
                "name": col["name"],
                "unresolved": [],
            }
        raise ValueError(f"不支持的 .mpf 类型: {parsed['type']}")

    @staticmethod
    def canvas_json_to_mpf(data: dict, name: str = "") -> str:
        """把 JSON Canvas（.canvas 文件）内容转换为 .mpf canvas 文本（宽容解析）。"""
        canvas = {
            "nodes": [dict(n) for n in data.get("nodes", []) if isinstance(n, dict)],
            "edges": [dict(e) for e in data.get("edges", []) if isinstance(e, dict)],
        }
        return mpf_service.serialize_mpf({
            "type": "canvas",
            "name": name or "导入的图表",
            "canvas": canvas,
        })

    def export_collection_mpf(self, collection_id: str) -> str:
        """导出文档集为 .mpf：canvas → canvas 类型；其它 → doc 类型。"""
        for it in self.store.list_libraries():
            lib = self.store.get_library(it["id"])
            col = find_collection(lib, collection_id)
            if col is None:
                continue
            if col.get("kind") == "canvas":
                return mpf_service.serialize_mpf({
                    "type": "canvas",
                    "name": col["name"],
                    "description": col.get("description", ""),
                    "canvas": col.get("canvas", {"nodes": [], "edges": []}),
                })
            return mpf_service.serialize_mpf({
                "type": "doc",
                "name": col["name"],
                "description": col.get("description", ""),
                "author": col.get("author", ""),
                "version": col.get("version", "1.0.0"),
                "collections": [col],
            })
        raise KeyError(f"文档集不存在: {collection_id}")

    def export_library_mpf(self, library_id: str) -> str:
        """导出整个库为 .mpf（doc 类型）。"""
        lib = self.store.get_library(library_id)
        return mpf_service.serialize_mpf({
            "type": "doc",
            "id": lib["id"],
            "name": lib["name"],
            "description": lib.get("description", ""),
            "collections": lib.get("collections", []),
        })

    # ---------------- Markdown / Obsidian 笔记导入 ----------------
    def import_markdown(self, text: str, filename: str, library_id: str = "", collection_id: str = "") -> dict:
        """将 markdown 文件导入为 文档（章节），二级及以上标题为 小节（知识点）。

        每个小节的正文内容保存为一个 markdown 块；一级标题优先作为文档名。
        """
        doc_name = filename
        lines = text.splitlines()
        sections: list[dict] = []
        current_name = "概述"
        current_lines: list[str] = []
        has_h1 = False

        def flush():
            content = "\n".join(current_lines).strip()
            if content:
                sections.append({"name": current_name, "content": content})

        for line in lines:
            m = re.match(r"^#\s+(.*)$", line)
            if m:
                has_h1 = True
                doc_name = m.group(1).strip() or filename
                continue
            m = re.match(r"^(#{2,6})\s+(.*)$", line)
            if m:
                flush()
                current_name = m.group(2).strip()
                current_lines = []
            else:
                current_lines.append(line)
        flush()

        # 目标库
        if library_id:
            lib = self.store.get_library(library_id)
        else:
            lib = self.store.create_library("笔记库", "导入的 Markdown / Obsidian 笔记")
        # 目标文档集（笔记集合）
        if collection_id:
            col = find_collection(lib, collection_id)
            if col is None:
                raise KeyError(f"文档集不存在: {collection_id}")
        else:
            col = self.store.create_collection(lib["id"], {
                "name": "我的笔记", "kind": "note", "description": "由 Markdown 导入",
            })
        doc = self.store.create_document(col["id"], {"name": doc_name, "docType": "note"})
        for sec in sections:
            s = self.store.create_section(doc["id"], {"name": sec["name"]})
            self.store.add_block(s["id"], {"type": "markdown", "content": sec["content"]})
        return {"libraryId": lib["id"], "collectionId": col["id"], "documentId": doc["id"], "sectionCount": len(sections)}

    # ---------------- 导出 ----------------

    def export_collection(self, collection_id: str) -> bytes:
        for it in self.store.list_libraries():
            try:
                lib = self.store.get_library(it["id"])
            except KeyError:
                continue
            for col in lib.get("collections", []):
                if col["id"] != collection_id:
                    continue
                manifest = {
                    "formatVersion": FORMAT_VERSION,
                    "id": col.get("packageId") or col["id"],
                    "name": col["name"],
                    "author": col.get("author", ""),
                    "version": col.get("version", "1.0.0"),
                    "description": col.get("description", ""),
                    "kind": col.get("kind", "course"),
                    "collections": [col],
                }
                buf = io.BytesIO()
                with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
                    zf.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
                    col_dir = self.assets_dir / collection_id
                    if col_dir.exists():
                        for p in col_dir.rglob("*"):
                            if p.is_file():
                                zf.writestr(p.relative_to(col_dir).as_posix(), p.read_bytes())
                return buf.getvalue()
        raise KeyError(f"课程不存在: {collection_id}")
