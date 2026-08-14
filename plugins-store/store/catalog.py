"""商店清单管理：index.json 读写与从 packages/ 重建。"""
from __future__ import annotations

import json
from pathlib import Path

from .validation import ValidationError, parse_plugin_package

DATA_DIR = Path(__file__).resolve().parent / "data"
PACKAGES_DIR = DATA_DIR / "packages"
INDEX_PATH = DATA_DIR / "index.json"

DATA_DIR.mkdir(parents=True, exist_ok=True)
PACKAGES_DIR.mkdir(parents=True, exist_ok=True)

_ITEM_FIELDS = ("id", "name", "version", "description", "author", "source", "specVersion", "tags")


def load_index() -> list[dict]:
    if not INDEX_PATH.exists():
        return []
    try:
        return json.loads(INDEX_PATH.read_text(encoding="utf-8"))
    except Exception:
        return []


def save_index(items: list[dict]) -> list[dict]:
    INDEX_PATH.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")
    return items


def rebuild_index() -> list[dict]:
    """扫描 packages/*.zip 重建清单（上传后调用，保证 index.json 与磁盘一致）。"""
    items: list[dict] = []
    for pkg in sorted(PACKAGES_DIR.glob("*.zip")):
        try:
            meta = parse_plugin_package(pkg.read_bytes())
        except ValidationError as e:
            # 脏包不影响整店可用性：跳过并记录
            print(f"[store] 跳过无效包 {pkg.name}: {e}")
            continue
        items.append(_to_item(meta, pkg))
    items.sort(key=lambda i: i["id"])
    return save_index(items)


def _to_item(meta: dict, pkg: Path) -> dict:
    item = {k: meta.get(k) for k in _ITEM_FIELDS}
    item["size"] = pkg.stat().st_size
    item["downloadUrl"] = f"/api/store/plugins/{meta['id']}/download"
    return item
