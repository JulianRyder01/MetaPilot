# -*- coding: utf-8 -*-
"""官方功能演示课程包生成与导入：交互式学习 v1.1.0 新功能演示（demo-features）。

运行方式（在 backend/ 目录下）：
    python scripts/seed_demo_features.py

流程：
1. 读取 courses/demo-features/manifest.json（已手工编写，含演示内容）
2. 将 manifest + interactives/ 资产导入本地数据（data/），供客户端直接使用
3. 课程包目录本身就是可分发、可再次 zip 导入的官方课程包

演示覆盖：
- ① 交互块高度自适应 / 拖拽 / 全屏（static_demo.html）
- ② 限时答题：隐藏题目、超时自动提交、可重试、接续上一题限时、超时锁定
- ③ 动态交互 HTML：四个前端埋点接口（添加文本/图片到评判上下文、AI 生成文本、
    结束并提交 AI 评判）+ AI 评判结果页（quest.html / chat_demo.html）
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
ROOT_DIR = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(BACKEND_DIR))

from app.config import DATA_DIR  # noqa: E402
from app.services.importer import CourseImporter  # noqa: E402
from app.services.mpf import register_core_mpf_types  # noqa: E402
from app.storage.store import LibraryStore  # noqa: E402

COURSE_DIR = ROOT_DIR / "courses" / "demo-features"
INTERACTIVES_DIR = COURSE_DIR / "interactives"


def main() -> bool:
    # .mpf 库文件解析需要核心 doc/canvas 类型注册（等价后端启动时的 register_core_mpf_types）
    register_core_mpf_types()

    manifest_path = COURSE_DIR / "manifest.json"
    if not manifest_path.exists():
        print(f"[错误] 缺少课程包清单: {manifest_path}")
        return False
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

    # 导入本地数据（幂等：复用同名库，同 packageId 课程自动替换）
    store = LibraryStore(DATA_DIR)
    importer = CourseImporter(store, DATA_DIR / "assets" / "courses")
    assets = {
        f"interactives/{p.name}": p.read_bytes()
        for p in sorted(INTERACTIVES_DIR.glob("*.html"))
    }
    library_id = next(
        (it["id"] for it in store.list_libraries() if it["name"] == manifest["library"]["name"]),
        "",
    )
    result = importer.import_package(manifest, assets, library_id=library_id)
    print(f"[导入成功] 库: {manifest['library']['name']}，课程: {result}")
    print("          可在客户端「我的库 → 演示功能库 → 功能演示 · 交互式学习 v1.1.0」中体验全部新功能。")
    return True


if __name__ == "__main__":
    sys.exit(0 if main() else 1)
