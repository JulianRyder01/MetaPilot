# -*- coding: utf-8 -*-
"""科目一驾考宝典 · 课程包构建辅助（helpers）。

用法：内容模块 import 本文件的 helper 组装 blocks/sections/documents，
主脚本 seed_subject1.py 合并所有文档生成 manifest.json。
"""
from __future__ import annotations
from typing import Any, Iterable

# ---------------- 块构建 helper ----------------

def md(content: str) -> dict:
    return {"type": "markdown", "content": content.strip()}


def sc(question: str, options: list[str], answer: int, explanation: str, **kw) -> dict:
    d = {"type": "single_choice", "question": question, "options": options,
         "answer": answer, "explanation": explanation}
    d.update(kw)  # 支持 timeLimitSec / hiddenBefore / autoSubmitOnTimeout / retryable / continuePrev
    return d


def mc(question: str, options: list[str], answers: list[int], explanation: str, **kw) -> dict:
    d = {"type": "multiple_choice", "question": question, "options": options,
         "answers": answers, "explanation": explanation}
    d.update(kw)
    return d


def fb(question: str, blanks: list[str], explanation: str, ai: bool = False, **kw) -> dict:
    d = {"type": "fill_blank", "question": question, "blanks": blanks,
         "explanation": explanation, "ai_graded": ai}
    d.update(kw)
    return d


def sa(question: str, reference: str, keywords: list[str], explanation: str, **kw) -> dict:
    d = {"type": "short_answer", "question": question, "reference": reference,
         "keywords": keywords, "explanation": explanation, "ai_graded": True}
    d.update(kw)
    return d


def iv(file: str, title: str, height: int = 560, **kw) -> dict:
    """interactive 块；kw 支持 mode/multimodal/scenario 等动态交互配置。"""
    d = {"type": "interactive", "title": title, "file": file, "height": height}
    d.update(kw)
    return d


# ---------------- 快捷题目 ----------------

def judge(question: str, correct: bool, explanation: str, **kw) -> dict:
    """判断题：correct=True 表示"正确"为答案。"""
    return sc(question, ["正确", "错误"], 0 if correct else 1, explanation, **kw)


def q(question: str, options: list[str], answer: int, explanation: str, **kw) -> dict:
    return sc(question, options, answer, explanation, **kw)


# ---------------- 容器 helper ----------------

def section(name: str, *blocks: dict) -> dict:
    return {"name": name, "blocks": [b for b in blocks if b]}


def doc(name: str, doc_type: str, *sections: dict, **kw) -> dict:
    d = {"name": name, "docType": doc_type, "sections": [s for s in sections if s]}
    d.update(kw)
    return d


def study(name: str, *sections: dict, **kw) -> dict:
    return doc(name, "study", *sections, **kw)


def quiz(name: str, *sections: dict, **kw) -> dict:
    return doc(name, "quiz", *sections, **kw)


# ---------------- 编排 helper ----------------

def collect(iterables: Iterable[Any]) -> list:
    """顺序拼接多个列表。"""
    out: list = []
    for it in iterables:
        out.extend(it)
    return out