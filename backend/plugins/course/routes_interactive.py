"""交互式学习插件 · 动态交互 HTML 的 AI 接口。

动态交互 HTML（interactive 块 mode="dynamic"）在前端 iframe 内通过埋点接口调用：
- 添加文本/图片到评判上下文：由前端暂存，最终随「结束并提交」一并提交（本文件不存储状态）
- AI 生成文本：POST /ai/generate_text（子对话场景：模拟人机对话、提示词工程生成 JSON 等）
- 结束并提交给 AI 评判：POST /ai/judge_interactive（情景设定 + 评判上下文 → Markdown/Html 结果页）

模型统一走核心 AI 网关（app.state.ai_gateway）的全局配置（跟随系统模型），
用量归属本（course）插件。禁用本插件时所有端点返回 503（requires_plugin）。
"""
from __future__ import annotations

import json
import re
from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from app.plugins.base import requires_plugin
from app.services.ai_gateway import AIGateway, NotConfiguredError

ai_router = APIRouter(
    prefix="/api/plugins/course/ai",
    tags=["course-interactive-ai"],
    dependencies=[Depends(requires_plugin("course"))],
)


def _gateway(request: Request) -> Optional[AIGateway]:
    return getattr(request.app.state, "ai_gateway", None)


def _extract_json(text: str) -> dict:
    """从 AI 返回文本中提取 JSON 对象（容错 <think> 推理块 / markdown 包裹）。"""
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()
    decoder = json.JSONDecoder()
    idx = text.find("{")
    while idx != -1:
        try:
            data, _ = decoder.raw_decode(text[idx:])
            if isinstance(data, dict):
                return data
        except json.JSONDecodeError:
            pass
        idx = text.find("{", idx + 1)
    raise ValueError(f"AI 返回无法解析为 JSON: {text[:200]}")


class GenerateTextIn(BaseModel):
    """AI 生成文本请求（子对话场景；context 由前端自行维护，可传空）。"""

    prompt: str
    context: list[str] = []


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
    """结束并提交给 AI 评判：根据情景设定 + 评判上下文，生成 Markdown/Html 结果展示页。"""
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
        "2. 同时输出 Markdown 与 HTML 两个版本，内容一致；"
        "3. HTML 版本要美观精致，允许内嵌 <style> 样式、排版卡片/进度/图表等，用 <div> 包裹、不要 <html>/<body> 外壳；"
        "4. Markdown 版本中也可以内嵌 HTML（保持可读性）；"
        "5. 只输出 JSON，不要输出其他内容：{\"markdown\": \"...\", \"html\": \"...\"}"
    )
    try:
        result = await gw.chat(
            [{"role": "user", "content": "\n".join(lines)}],
            temperature=0.6,
            max_tokens=4096,
            response_format={"type": "json_object"},
            plugin="course",
        )
        data = _extract_json(result["content"])
    except NotConfiguredError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI 评判失败: {e}")

    markdown = str(data.get("markdown") or "").strip()
    html = str(data.get("html") or "").strip()
    if not markdown and not html:
        raise HTTPException(status_code=502, detail="AI 评判未返回有效结果")
    return {
        "markdown": markdown,
        "html": html,
        "model": result.get("model", ""),
    }
