"""学习进度存储：每个课程独立，记录已学完小节与上次学习位置。"""
from __future__ import annotations

import threading
from pathlib import Path
from typing import Optional

from .store import _read_json, _write_json, now_iso


class ProgressStore:
    def __init__(self, data_dir: str | Path):
        self.path = Path(data_dir) / "progress.json"
        self.lock = threading.Lock()

    def _load(self) -> dict:
        return _read_json(self.path, {"collections": {}})

    def _save(self, data: dict) -> None:
        _write_json(self.path, data)

    def get(self, collection_id: str) -> dict:
        data = self._load()
        return data["collections"].get(collection_id, {
            "completedSections": [],
            "lastPosition": None,
            "updatedAt": None,
        })

    def toggle_completed(self, collection_id: str, section_id: str) -> bool:
        with self.lock:
            data = self._load()
            prog = data["collections"].setdefault(collection_id, {
                "completedSections": [],
                "lastPosition": None,
                "updatedAt": None,
            })
            done = prog["completedSections"]
            if section_id in done:
                done.remove(section_id)
                completed = False
            else:
                done.append(section_id)
                completed = True
            prog["updatedAt"] = now_iso()
            self._save(data)
            return completed

    def set_completed(self, collection_id: str, section_id: str, completed: bool) -> None:
        with self.lock:
            data = self._load()
            prog = data["collections"].setdefault(collection_id, {
                "completedSections": [],
                "lastPosition": None,
                "updatedAt": None,
            })
            done = prog["completedSections"]
            if completed and section_id not in done:
                done.append(section_id)
            if not completed and section_id in done:
                done.remove(section_id)
            prog["updatedAt"] = now_iso()
            self._save(data)

    def set_position(self, collection_id: str, document_id: str, section_id: str) -> None:
        with self.lock:
            data = self._load()
            prog = data["collections"].setdefault(collection_id, {
                "completedSections": [],
                "lastPosition": None,
                "updatedAt": None,
            })
            prog["lastPosition"] = {"documentId": document_id, "sectionId": section_id}
            prog["updatedAt"] = now_iso()
            self._save(data)

    def remove_collection(self, collection_id: str) -> None:
        with self.lock:
            data = self._load()
            data["collections"].pop(collection_id, None)
            self._save(data)

    def all(self) -> dict:
        return self._load()["collections"]
