"""官方核心 · 基础统计服务（统计页 core 组件的数据源）。

记录文档访问（最常访问/热力图/停留时长），并从库树计算内容字数。
统计页组件由 core 与各插件共同注册（见 app/stats_widgets.py）。
"""
from __future__ import annotations

import re
import threading
from pathlib import Path
from typing import Optional

from app.storage.store import _read_json, _write_json, gen_id, now_iso

MAX_EVENTS = 20000


class StatsCoreService:
    def __init__(self, data_dir: str | Path, store=None):
        self.path = Path(data_dir) / "stats_core.json"
        self.lock = threading.Lock()
        self.store = store  # LibraryStore（用于字数统计）

    def _load(self) -> dict:
        return _read_json(self.path, {"events": []})

    def _save(self, data: dict) -> None:
        _write_json(self.path, data)

    # ---- 访问记录 ----

    def record_visit(self, cid: str, doc_id: str, doc_name: str = "", duration_sec: int = 0) -> dict:
        with self.lock:
            data = self._load()
            ev = {
                "id": gen_id(),
                "cid": cid,
                "docId": doc_id,
                "docName": doc_name,
                "at": now_iso(),
                "durationSec": max(0, int(duration_sec)),
            }
            data["events"].append(ev)
            if len(data["events"]) > MAX_EVENTS:
                data["events"] = data["events"][-MAX_EVENTS:]
            self._save(data)
            return ev

    def remove_collection(self, cid: str) -> None:
        with self.lock:
            data = self._load()
            data["events"] = [e for e in data["events"] if e["cid"] != cid]
            self._save(data)

    # ---- 字数统计（遍历库树） ----

    def _count_words(self) -> dict:
        """返回 {totalWords, perCollection: [{id, name, words}]}。"""
        total = 0
        per = []
        if self.store is None:
            return {"totalWords": 0, "perCollection": []}
        for it in self.store.list_libraries():
            try:
                lib = self.store.get_library(it["id"])
            except KeyError:
                continue
            for col in lib.get("folders", lib.get("collections", [])):
                words = 0
                for doc in col.get("documents", []):
                    for sec in doc.get("sections", []):
                        for b in sec.get("blocks", []):
                            if b.get("type") == "markdown":
                                words += len(re.sub(r"\s+", "", b.get("content") or ""))
                per.append({"id": col["id"], "name": col["name"], "words": words})
                total += words
        return {"totalWords": total, "perCollection": per}

    def _lib_tree(self) -> tuple[set[str], dict[str, str]]:
        """遍历库树：返回 (有效集合 id 集合, docId -> 文档名 映射)。

        用于过滤指向已删除课程的访问事件，并用库内最新文档名回填显示。
        """
        valid_cids: set[str] = set()
        doc_names: dict[str, str] = {}
        if self.store is None:
            return valid_cids, doc_names
        for it in self.store.list_libraries():
            try:
                lib = self.store.get_library(it["id"])
            except KeyError:
                continue
            for col in lib.get("folders", lib.get("collections", [])):
                valid_cids.add(col["id"])
                for doc in col.get("documents", []):
                    doc_names.setdefault(doc["id"], doc.get("name") or "")
        return valid_cids, doc_names

    # ---- 汇总 ----

    def summary(self) -> dict:
        data = self._load()
        events = data["events"]

        # 过滤指向不存在课程的访问事件（如测试残留数据），并记录最新文档名
        valid_cids, doc_names = self._lib_tree()
        if self.store is not None:
            events = [e for e in events if e["cid"] in valid_cids]

        def resolve_name(e: dict) -> str:
            return doc_names.get(e["docId"]) or e["docName"] or e["docId"]

        total_duration = sum(e["durationSec"] for e in events)

        # 最常访问文档
        doc_stat: dict[str, dict] = {}
        for e in events:
            s = doc_stat.setdefault(e["docId"], {"docId": e["docId"], "name": resolve_name(e), "visits": 0, "totalDurationSec": 0})
            s["visits"] += 1
            s["totalDurationSec"] += e["durationSec"]
        top_docs = sorted(doc_stat.values(), key=lambda d: -d["visits"])[:10]

        # 最近访问（按写入顺序取末尾，时间戳秒级可能相同）
        recent = list(reversed(events[-10:]))
        recent_docs = [
            {"docId": e["docId"], "name": resolve_name(e), "at": e["at"], "durationSec": e["durationSec"]}
            for e in recent
        ]

        # 热力图：按星期几 × 小时 + 按日（用于月度日历热力图）
        from datetime import datetime
        by_weekday = [0] * 7
        by_hour = [0] * 24
        by_date: dict[str, int] = {}
        for e in events:
            try:
                dt = datetime.fromisoformat(e["at"])
            except Exception:
                continue
            by_weekday[dt.weekday()] += 1
            by_hour[dt.hour] += 1
            by_date[dt.date().isoformat()] = by_date.get(dt.date().isoformat(), 0) + 1

        words = self._count_words()
        return {
            "totalVisits": len(events),
            "totalDurationSec": total_duration,
            "topDocs": top_docs,
            "recentDocs": recent_docs,
            "heatmap": {
                "byWeekday": by_weekday,
                "byHour": by_hour,
                "byDate": [{"date": k, "count": v} for k, v in sorted(by_date.items())],
            },
            "totalWords": words["totalWords"],
            "wordsPerCollection": words["perCollection"],
        }


stats_core_service: Optional[StatsCoreService] = None


def init_stats_core(data_dir, store):
    global stats_core_service
    stats_core_service = StatsCoreService(data_dir, store)
    return stats_core_service
