# -*- coding: utf-8 -*-
"""科目一驾考宝典 · 课程包生成与校验。

运行方式（仓库根目录）：
    python courses/subject1-driving/scripts/seed_subject1.py

流程：
1. 合并 content_ch1_6 / content_ch7_12 / content_exam 三个内容模块
2. 生成 courses/subject1-driving/manifest.json
3. 校验：JSON 合法性、块类型字段、interactive 文件引用、题库答案索引范围、
   题目/选项非空等
4. 若后端依赖可用，则导入本地数据（power-user 可选）
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
COURSE_DIR = ROOT / "courses" / "subject1-driving"
SCRIPTS = COURSE_DIR / "scripts"
INTERACTIVES = COURSE_DIR / "interactives"
MANIFEST = COURSE_DIR / "manifest.json"

sys.path.insert(0, str(SCRIPTS))
import content_ch1_6  # noqa: E402
import content_ch7_12  # noqa: E402
import content_exam  # noqa: E402

COURSE_ID = "subject1-driving"
COURSE_NAME = "科目一驾考宝典"
COURSE_COLLECTION = "科目一 · 学练考一体教学课程"

VALID_BLOCK_TYPES = {
    "markdown", "single_choice", "multiple_choice", "fill_blank", "short_answer", "interactive",
}


def build_manifest() -> dict:
    documents = content_ch1_6.chapters() + content_ch7_12.chapters() + content_exam.chapters()
    return {
        "formatVersion": 1,
        "id": COURSE_ID,
        "name": COURSE_NAME,
        "author": "MetaPilot",
        "version": "1.0.0",
        "description": (
            "科目一（道路交通安全法律、法规和相关知识考试）学练考一体课程。"
            "依据 2022-04-01 施行的公安部令第163号《道路交通安全违法行为记分管理办法》"
            "（12/9/6/3/1 五档）与现行道交法及其条例整理，覆盖考试大纲全部七大项："
            "记分规则、违法处罚、驾驶证管理、道路通行、限速高速、交通信号（标志/手势）、"
            "事故急救、安全文明驾驶、车辆仪表装置（ABS/ACC/LDW）。"
            "含 13 个学习章节 + 100 题全真模拟考试，9 个交互式训练组件（记分分类训练、"
            "标志图鉴、限速训练、高速情景模拟、手势识别、仪表灯识别、口诀记忆卡、摸底自测、"
            "动态事故演练 AI 评判）。按「学-练-考」闭环学习，冲刺 95+。"
        ),
        "library": {
            "name": COURSE_NAME,
            "description": "驾考科目一理论考试宝库（2022 新规口径）",
        },
        "collections": [
            {
                "name": COURSE_COLLECTION,
                "kind": "course",
                "description": "学练考一体：先学（13 章系统讲解+交互演示）→ 再练（章节内嵌题库+专项训练器）→ 后考（100 题全真模拟，45 分钟、90 分合格）。错题对照解析回炉，模拟稳定 95+ 再上考场。",
                "documents": documents,
            }
        ],
    }


def validate(manifest: dict) -> list[str]:
    errors: list[str] = []
    docs = manifest["collections"][0]["documents"]
    used_files = set()
    total_blocks = 0
    total_questions = 0

    if manifest["id"] != COURSE_ID:
        errors.append(f"manifest.id 应为 {COURSE_ID}")

    for doc_idx, d in enumerate(docs):
        if d["docType"] not in ("study", "quiz", "note"):
            errors.append(f"文档[{doc_idx}] {d.get('name')} docType 非法: {d.get('docType')}")
        for s in d.get("sections", []):
            for b in s.get("blocks", []):
                total_blocks += 1
                btype = b.get("type")
                if btype not in VALID_BLOCK_TYPES:
                    errors.append(f"文档[{doc_idx}] {d.get('name')} 小节 {s.get('name')} 块类型非法: {btype}")
                    continue
                if btype in ("single_choice", "multiple_choice", "fill_blank", "short_answer"):
                    total_questions += 1
                    if not b.get("question", "").strip():
                        errors.append(f"文档[{doc_idx}] {d.get('name')} 题目为空: {s.get('name')}")
                if btype in ("single_choice", "multiple_choice"):
                    opts = b.get("options") or []
                    if not opts or len(opts) < 2:
                        errors.append(f"文档[{doc_idx}] {d.get('name')} 选择题选项不足: {b.get('question', '')[:30]}")
                    if btype == "single_choice":
                        ans = b.get("answer")
                        if not isinstance(ans, int) or not (0 <= ans < len(opts)):
                            errors.append(f"文档[{doc_idx}] {d.get('name')} 单选题答案越界: {b.get('question', '')[:30]}")
                    else:
                        answers = b.get("answers") or []
                        if not answers or any(not isinstance(a, int) or not (0 <= a < len(opts)) for a in answers):
                            errors.append(f"文档[{doc_idx}] {d.get('name')} 多选题答案越界: {b.get('question', '')[:30]}")
                if btype == "fill_blank":
                    if not b.get("blanks") or not any(str(x).strip() for x in b["blanks"]):
                        errors.append(f"文档[{doc_idx}] {d.get('name')} 填空题答案为空: {b.get('question', '')[:30]}")
                if btype == "interactive":
                    f = b.get("file", "")
                    p = INTERACTIVES / f.removeprefix("interactives/")
                    try:
                        rel = p.relative_to(COURSE_DIR)  # 防路径越界（如 ../escape）导致崩溃
                    except ValueError:
                        errors.append(f"交互文件路径越界: {f} (引用处: {d.get('name')} / {s.get('name')})")
                        continue
                    if not p.is_file():
                        errors.append(f"交互文件缺失: {f} (引用处: {d.get('name')} / {s.get('name')})")
                        continue
                    used_files.add(str(rel))
                    if b.get("mode") == "dynamic" and not b.get("scenario"):
                        errors.append(f"动态交互块缺少 scenario: {f}")

    # 检查交互目录中未引用的文件
    for p in sorted(INTERACTIVES.glob("*.html")):
        rel = str(p.relative_to(COURSE_DIR))
        if rel not in used_files:
            errors.append(f"交互文件未被引用: {rel}")

    print(f"[校验] 文档数={len(docs)} 块总数={total_blocks} 题目数={total_questions} 交互文件引用={len(used_files)}")
    return errors


def main() -> int:
    manifest = build_manifest()
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[生成] {MANIFEST} ({MANIFEST.stat().st_size} bytes)")

    errors = validate(manifest)
    if errors:
        print(f"[失败] 校验发现 {len(errors)} 个问题：")
        for e in errors:
            print(f"  - {e}")
        return 1

    print("[成功] 课程包校验通过：manifest.json 合法，所有交互文件引用有效。")
    if "--import" in sys.argv or os.environ.get("SEED_IMPORT", "").lower() in ("1", "true", "yes"):
        imp_ok = import_to_backend()
        return 0 if imp_ok else 2
    print("      如需导入后端本地数据（客户端直接可用），请运行：")
    print("      cd backend && python ../courses/subject1-driving/scripts/seed_subject1.py --import")
    return 0


def import_to_backend() -> bool:
    """将课程包导入后端本地数据（幂等：复用同名库、同 packageId 替换旧课程并重落资产）。

    需在 backend/ 目录下运行（DATA_DIR 为相对路径 .env 配置，取决于 cwd）。
    """
    sys.path.insert(0, str(ROOT / "backend"))
    try:
        from app.config import DATA_DIR  # noqa: E402
        from app.services.importer import CourseImporter  # noqa: E402
        from app.services.mpf import register_core_mpf_types  # noqa: E402
        from app.storage.store import LibraryStore  # noqa: E402
    except Exception as e:  # 后端依赖未安装
        print(f"[导入失败] 后端依赖不可用: {e}")
        return False

    register_core_mpf_types()
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    store = LibraryStore(DATA_DIR)
    importer = CourseImporter(store, DATA_DIR / "assets" / "courses")
    assets = {
        f"interactives/{p.name}": p.read_bytes()
        for p in sorted(INTERACTIVES.glob("*.html"))
    }
    print(f"[导入] 课程包: {manifest['name']}，资产 {len(assets)} 个 → {DATA_DIR}")
    library_id = next(
        (it["id"] for it in store.list_libraries() if it["name"] == manifest["library"]["name"]),
        "",
    )
    result = importer.import_package(manifest, assets, library_id=library_id)
    print(f"[导入成功] 库: {manifest['library']['name']}，课程集合: {result}")
    return True


if __name__ == "__main__":
    sys.exit(main())