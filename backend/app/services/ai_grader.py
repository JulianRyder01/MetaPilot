"""AI 判题服务：经统一 AI 网关（核心 1.1.1）调用模型，对比用户作答与参考答案，
输出准确率与评语（走网关可统计用量与成本）。

网关由调用方注入（app.state.ai_gateway）；未注入时回退到旧 MiniMax 直连配置（兼容）。
"""
from __future__ import annotations

import json
import re
from typing import Any, Optional

from ..config import settings
from .ai_gateway import AIGateway


class AIGrader:
    def __init__(self, gateway: Optional[AIGateway] = None):
        self.gateway = gateway

    def _build_prompt(self, payload: dict) -> str:
        block_type = payload.get("blockType", "short_answer")
        type_label = "填空题" if block_type == "fill_blank" else "简答题"
        lines = [
            "你是严格的课程评分老师，请根据题目与参考答案，对学生的作答进行评分。",
            f"题目类型：{type_label}",
            f"题目：{payload.get('question', '')}",
        ]
        if payload.get("reference"):
            lines.append(f"参考答案：{payload['reference']}")
        if payload.get("blanks"):
            lines.append("各空参考答案：" + "；".join(payload["blanks"]))
        if payload.get("keywords"):
            lines.append("必须出现的关键词：" + "、".join(payload["keywords"]))
        lines.append(f"学生作答：{payload.get('userAnswer', '')}")
        lines.append(
            "评分要求："
            "1. 对比学生作答与参考答案的语义，而不是逐字匹配；"
            "2. score 为 0-100 的整数准确率，便于打分；"
            "3. isCorrect 当 score>=60 时为 true；"
            "4. feedback 为 100 字以内的中文评语，指出对错与改进建议；"
            "只输出 JSON，不要输出其他内容："
            '{"score": 0, "feedback": "", "isCorrect": false}'
        )
        return "\n".join(lines)

    @staticmethod
    def _parse_response(text: str) -> dict[str, Any]:
        """解析 AI 返回文本，容错 <think> 推理块、markdown 包裹等情况。"""
        text = text.strip()
        # 剥除推理块（网关已剥，这里兜底）
        text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            decoder = json.JSONDecoder()
            idx = text.find("{")
            data = None
            while idx != -1:
                try:
                    data, _ = decoder.raw_decode(text[idx:])
                    break
                except json.JSONDecodeError:
                    idx = text.find("{", idx + 1)
            if data is None:
                raise ValueError(f"AI 返回无法解析: {text[:200]}")
        score = int(round(float(data.get("score", 0))))
        score = max(0, min(100, score))
        feedback = str(data.get("feedback", ""))
        is_correct = bool(data.get("isCorrect", score >= 60))
        return {"score": score, "feedback": feedback, "isCorrect": is_correct}

    async def grade(self, payload: dict) -> dict:
        prompt = self._build_prompt(payload)
        if self.gateway is not None:
            result = await self.gateway.chat(
                [{"role": "user", "content": prompt}],
                temperature=0.2,
                max_tokens=1024,
                response_format={"type": "json_object"},
                plugin="course",
            )
            return self._parse_response(result["content"])

        # 回退：旧 MiniMax 直连（未装配网关的旧调用方/测试）
        if not settings.minimax_api_key:
            raise RuntimeError("未配置 AI 服务（MINIMAX_API_KEY / AI_API_KEY），请在设置中填写")
        import httpx

        body = {
            "model": settings.minimax_model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.2,
            "response_format": {"type": "json_object"},
        }
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                f"{settings.minimax_base_url}/chat/completions",
                headers={"Authorization": f"Bearer {settings.minimax_api_key}"},
                json=body,
            )
            resp.raise_for_status()
            data = resp.json()
        return self._parse_response(data["choices"][0]["message"]["content"])


grader = AIGrader()
