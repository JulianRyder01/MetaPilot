"""交互式学习插件 · 动态交互 HTML 的 AI 接口。

动态交互 HTML（interactive 块 mode="dynamic"）在前端 iframe 内通过埋点接口调用：
- 添加文本/图片到评判上下文：由前端暂存，最终随「结束并提交」一并提交（本文件不存储状态）
- AI 生成文本：POST /ai/generate_text（子对话场景：模拟人机对话、提示词工程生成 JSON 等）
- 结束并提交给 AI 评判：POST /ai/judge_interactive（情景设定 + 评判上下文 → HTML 结果页）

模型统一走核心 AI 网关（app.state.ai_gateway）的全局配置（跟随系统模型），
用量归属本（course）插件。禁用本插件时所有端点返回 503（requires_plugin）。
"""
from __future__ import annotations

import re
from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, field_validator

from app.plugins.base import requires_plugin
from app.services.ai_gateway import AIGateway, NotConfiguredError

ai_router = APIRouter(
    prefix="/api/plugins/course/ai",
    tags=["course-interactive-ai"],
    dependencies=[Depends(requires_plugin("course"))],
)


def _gateway(request: Request) -> Optional[AIGateway]:
    return getattr(request.app.state, "ai_gateway", None)


class GenerateTextIn(BaseModel):
    """AI 生成文本请求（子对话场景；context 由前端自行维护，可传空）。"""

    prompt: str
    context: list[str] = []

    @field_validator("prompt")
    @classmethod
    def _prompt_len(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("prompt 不能为空")
        if len(v) > 10000:
            raise ValueError("prompt 过长（上限 10000 字符）")
        return v

    @field_validator("context")
    @classmethod
    def _ctx_len(cls, v: list[str]) -> list[str]:
        if len(v) > 50:
            raise ValueError("context 条目过多（上限 50 条）")
        return v


@ai_router.post("/generate_text")
async def generate_text(body: GenerateTextIn, request: Request):
    """AI 生成文本：动态交互 HTML 的「AI 生成文本」埋点接口。

    前端自行维护子对话的 context json（本接口不保存上下文）；
    context 列表按序拼入提示词，供需要多轮对话延续的制作者使用。
    """
    gw = _gateway(request)
    if gw is None:
        raise HTTPException(status_code=503, detail="AI 网关不可用")
    parts: list[str] = []
    if body.context:
        parts.append("以下是本次子对话的历史上下文（按时间顺序）：")
        parts.extend(f"- {c}" for c in body.context)
    parts.append("用户输入：" + body.prompt)
    parts.append("请直接输出你的回应文本，不要输出其他内容。")
    try:
        result = await gw.chat(
            [{"role": "user", "content": "\n".join(parts)}],
            temperature=0.7,
            max_tokens=2048,
            plugin="course",
        )
    except NotConfiguredError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI 生成文本失败: {e}")
    return {"text": result["content"], "model": result.get("model", "")}


class JudgeContextItem(BaseModel):
    """评判上下文条目：text=文本；image=图片（data URL / base64）。"""

    type: Literal["text", "image"]
    content: str

    @field_validator("content")
    @classmethod
    def _content_len(cls, v: str) -> str:
        # 文本 ≤ 5000 字符；图片 data URL（base64）≤ 5MB（约 6.7M 字符）
        limit = 6_700_000 if v.startswith("data:image/") else 5000
        if len(v) > limit:
            raise ValueError(f"上下文条目过大（上限 {limit} 字符）")
        return v


class JudgeInteractiveIn(BaseModel):
    """结束并提交给 AI 评判请求。

    scenario：动态交互情景设定（规则 / 评判标准 / 输出格式等，制作时写入、编辑页可改）；
    context：本次交互过程中前端通过埋点收集的评判上下文（文本 + 图片）。
    """

    scenario: str = ""
    context: list[JudgeContextItem] = []
    blockTitle: str = ""


@ai_router.post("/judge_interactive")
async def judge_interactive(body: JudgeInteractiveIn, request: Request):
    """结束并提交给 AI 评判：根据情景设定 + 评判上下文，生成 HTML 结果展示页（原生 HTML，不解析 JSON）。"""
    gw = _gateway(request)
    if gw is None:
        raise HTTPException(status_code=503, detail="AI 网关不可用")

    lines: list[str] = []
    title = body.blockTitle.strip() or "动态交互"
    lines.append(f"你是一位严谨且有创造力的评判 AI，负责对「{title}」这个动态交互情景的完整过程进行评判与总结。")
    lines.append("【情景设定（制作方编写：规则、评判标准、输出格式等）】")
    lines.append(body.scenario.strip() or "（未提供情景设定）")
    lines.append("【本次交互过程记录（评判上下文，按时间顺序）】")
    if not body.context:
        lines.append("（无记录）")
    for item in body.context:
        if item.type == "text":
            lines.append(f"- 文本：{item.content}")
        else:
            lines.append(f"- 图片：{item.content}（这是一张用户/过程产生的图片，多模态模型可直接理解其内容）")
    lines.append(
        "【输出要求】"
        "1. 依据情景设定中的规则与评判标准，对本次交互过程给出评判与总结，并可视化为漂亮的结果展示页；"
        "2. 只输出一段可直接嵌入网页的 HTML 片段：不要输出 JSON、不要输出 Markdown、不要代码块包裹、不要 <html>/<body> 外壳、不要任何前言/解释文字（直接以 HTML 标签开头）；"
        "3. HTML 要美观精致，允许内嵌 <style> 样式，可用卡片/进度条/图表等排版展示结论、得分与建议，用 <div> 包裹。"
    )
    try:
        result = await gw.chat(
            [{"role": "user", "content": "\n".join(lines)}],
            temperature=0.6,
            max_tokens=8192,
            plugin="course",
        )
    except NotConfiguredError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI 评判失败: {e}")

    html = (result["content"] or "").strip()
    # 兜底剥离 AI 可能添加的 ```html … ``` 代码块包裹（结果即 HTML 原文，不解析 JSON）
    fence = re.match(r"^```(?:html)?\s*(.*?)\s*```$", html, flags=re.DOTALL)
    if fence:
        html = fence.group(1).strip()
    # 结果是直接渲染进 srcdoc 的 HTML，必须以标签开头（拒绝前言/解释文字等非 HTML 输出）
    if not html.startswith("<"):
        raise HTTPException(status_code=502, detail="AI 评判未返回有效结果（应为以 < 开头的 HTML 片段）")
    return {
        "html": html,
        "model": result.get("model", ""),
    }
