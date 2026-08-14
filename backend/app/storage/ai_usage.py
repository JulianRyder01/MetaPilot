"""AI 用量存储：统一网关的每次调用记录 token 使用量、调用次数与成本。

存储于 data/ai_usage.json（本地，不上云），供「统计」页展示。
"""
from __future__ import annotations

import json
import threading
from datetime import datetime, time, timedelta
from pathlib import Path
from typing import Optional

MAX_RECORDS = 20000


class AIUsageStore:
    def __init__(self, data_dir: Path):
        self.path = Path(data_dir) / "ai_usage.json"
        self._lock = threading.Lock()

    def _load(self) -> list[dict]:
        if not self.path.exists():
            return []
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
            return data.get("records", []) if isinstance(data, dict) else []
        except Exception:
            return []

    def _save(self, records: list[dict]) -> None:
        self.path.write_text(
            json.dumps({"records": records[-MAX_RECORDS:]}, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    def add(self, record: dict) -> None:
        """record: {ts, plugin, model, provider, inputTokens, cachedTokens, outputTokens, cost}"""
        with self._lock:
            records = self._load()
            records.append(record)
            self._save(records)

    def clear(self) -> None:
        with self._lock:
            self._save([])

    # ---------------- 汇总 ----------------

    @staticmethod
    def _in_range(ts: str, range_: str) -> bool:
        if range_ == "all":
            return True
        try:
            dt = datetime.fromisoformat(ts)
        except ValueError:
            return False
        now = datetime.now()
        if range_ == "today":
            return dt.date() == now.date()
        if range_ == "week":
            start = now - timedelta(days=now.weekday())
            return dt >= datetime.combine(start.date(), time.min)
        if range_ == "month":
            return dt.year == now.year and dt.month == now.month
        return True

    def summary(self, range_: str = "all") -> dict:
        """汇总：调用次数 / token（输入/缓存/输出）/ 成本，按模型分组。"""
        by_model: dict[str, dict] = {}
        totals = {"calls": 0, "inputTokens": 0, "cachedTokens": 0, "outputTokens": 0, "cost": 0.0}
        currency = ""
        for r in self._load():
            if not self._in_range(r.get("ts", ""), range_):
                continue
            model = r.get("model") or "未知模型"
            m = by_model.setdefault(model, {
                "model": model, "provider": r.get("provider", ""), "calls": 0,
                "inputTokens": 0, "cachedTokens": 0, "outputTokens": 0, "cost": 0.0,
            })
            m["calls"] += 1
            m["inputTokens"] += int(r.get("inputTokens") or 0)
            m["cachedTokens"] += int(r.get("cachedTokens") or 0)
            m["outputTokens"] += int(r.get("outputTokens") or 0)
            m["cost"] += float(r.get("cost") or 0.0)
            if r.get("currency"):
                currency = r["currency"]
            totals["calls"] += 1
            totals["inputTokens"] += int(r.get("inputTokens") or 0)
            totals["cachedTokens"] += int(r.get("cachedTokens") or 0)
            totals["outputTokens"] += int(r.get("outputTokens") or 0)
            totals["cost"] += float(r.get("cost") or 0.0)

        by_model_list = sorted(by_model.values(), key=lambda x: -x["cost"])
        return {
            "range": range_,
            "totalCalls": totals["calls"],
            "totalTokens": totals["inputTokens"] + totals["outputTokens"],
            "inputTokens": totals["inputTokens"],
            "cachedTokens": totals["cachedTokens"],
            "outputTokens": totals["outputTokens"],
            "totalCost": round(totals["cost"], 6),
            "currency": currency,
            "byModel": by_model_list,
        }
