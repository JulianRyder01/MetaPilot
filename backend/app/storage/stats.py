"""学习时长统计存储。"""
from __future__ import annotations

import threading
from datetime import datetime
from pathlib import Path
from typing import Optional

from .store import _read_json, _write_json, gen_id, now_iso


class StatsStore:
    def __init__(self, data_dir: str | Path):
        self.path = Path(data_dir) / "stats.json"
        self.lock = threading.Lock()

    def _load(self) -> dict:
        return _read_json(self.path, {"sessions": []})

    def _save(self, data: dict) -> None:
        _write_json(self.path, data)

    def add_session(self, session: dict) -> dict:
        with self.lock:
            data = self._load()
            record = {
                "id": gen_id(),
                "collectionId": session.get("collectionId", ""),
                "documentId": session.get("documentId", ""),
                "sectionId": session.get("sectionId", ""),
                "startAt": session.get("startAt") or now_iso(),
                "endAt": session.get("endAt") or now_iso(),
                "durationSec": max(0, int(session.get("durationSec", 0))),
            }
            data["sessions"].append(record)
            # 只保留最近 10000 条，防止无限增长
            if len(data["sessions"]) > 10000:
                data["sessions"] = data["sessions"][-10000:]
            self._save(data)
            return record

    def remove_collection(self, collection_id: str) -> None:
        with self.lock:
            data = self._load()
            data["sessions"] = [s for s in data["sessions"] if s["collectionId"] != collection_id]
            self._save(data)

    def summary(self, range_: str = "all") -> dict:
        """按 all|today|week|month 汇总：总时长、每日分布、每课程分布。"""
        data = self._load()
        sessions = data["sessions"]
        now = datetime.now()
        today = now.date()
        week_start = today.fromordinal(today.toordinal() - today.weekday())
        month_start = today.replace(day=1)

        def in_range(start_str: str) -> bool:
            try:
                d = datetime.fromisoformat(start_str).date()
            except Exception:
                return True
            if range_ == "today":
                return d == today
            if range_ == "week":
                return d >= week_start
            if range_ == "month":
                return d >= month_start
            return True

        filtered = [s for s in sessions if in_range(s["startAt"])]
        total = sum(s["durationSec"] for s in filtered)
        daily: dict[str, int] = {}
        per_collection: dict[str, int] = {}
        for s in filtered:
            d = datetime.fromisoformat(s["startAt"]).date().isoformat()
            daily[d] = daily.get(d, 0) + s["durationSec"]
            cid = s.get("collectionId") or "unknown"
            per_collection[cid] = per_collection.get(cid, 0) + s["durationSec"]
        return {
            "range": range_,
            "totalSeconds": total,
            "sessionCount": len(filtered),
            "daily": [{"date": k, "seconds": v} for k, v in sorted(daily.items())],
            "perCollection": [{"collectionId": k, "seconds": v} for k, v in sorted(per_collection.items(), key=lambda x: -x[1])],
        }
