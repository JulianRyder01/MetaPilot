"""AI 判题服务测试：经统一网关（FakeGateway）验证 prompt 构造与解析；解析容错用例保留。"""
import asyncio

import pytest

from app.services.ai_grader import AIGrader

VALID_JSON = '{"score": 82, "feedback": "回答正确，抓住了核心要点。", "isCorrect": true}'


class FakeGateway:
    def __init__(self):
        self.captured: dict = {}
        self.reply = VALID_JSON

    async def chat(self, messages, temperature=0.3, max_tokens=1024, response_format=None, plugin="core"):
        self.captured["messages"] = messages
        self.captured["response_format"] = response_format
        self.captured["plugin"] = plugin
        return {"content": self.reply, "inputTokens": 1, "cachedTokens": 0,
                "outputTokens": 1, "model": "fake", "provider": "fake"}


@pytest.mark.asyncio
async def test_grade_prompt_and_parse():
    gw = FakeGateway()
    g = AIGrader(gateway=gw)
    result = await g.grade({
        "blockType": "short_answer",
        "question": "简述采样定理",
        "reference": "采样频率应大于信号最高频率的两倍",
        "keywords": ["采样频率", "两倍"],
        "userAnswer": "采样频率要高于最高频率的2倍",
    }, plugin_id="course")
    assert result["score"] == 82
    assert result["isCorrect"] is True
    assert "核心要点" in result["feedback"]
    # 走网关：JSON 格式要求 + 中文 prompt + 插件来源 course
    assert gw.captured["response_format"] == {"type": "json_object"}
    assert gw.captured["plugin"] == "course"
    prompt = gw.captured["messages"][0]["content"]
    assert "采样定理" in prompt and "采样频率" in prompt
    assert "两倍" in prompt


@pytest.mark.asyncio
async def test_grade_uses_gateway_not_legacy():
    """网关可用时走中转（不直接 httpx 调 MiniMax）。"""
    gw = FakeGateway()
    g = AIGrader(gateway=gw)
    await g.grade({"blockType": "short_answer", "question": "q", "userAnswer": "a"})
    assert gw.captured["messages"][0]["role"] == "user"


@pytest.mark.asyncio
async def test_parse_markdown_wrapped_json():
    text = '```json\n{"score": 45, "feedback": "部分正确", "isCorrect": false}\n```'
    result = AIGrader._parse_response(text)
    assert result["score"] == 45
    assert result["isCorrect"] is False


@pytest.mark.asyncio
async def test_parse_with_think_block():
    text = ('<think>这是模型推理过程，包含 {score: 60} 这样的中间信息。</think>\n'
            '{"score": 90, "feedback": "回答正确", "isCorrect": true}')
    result = AIGrader._parse_response(text)
    assert result["score"] == 90
    assert result["isCorrect"] is True
    assert "回答正确" in result["feedback"]


@pytest.mark.asyncio
async def test_parse_score_clamped():
    assert AIGrader._parse_response('{"score": 150, "feedback": "", "isCorrect": true}')["score"] == 100
    assert AIGrader._parse_response('{"score": -10, "feedback": "", "isCorrect": false}')["score"] == 0


def test_no_key_raises_on_legacy_fallback(monkeypatch):
    """网关不可用且未配置任何 key 时抛错（回退旧直连路径）。"""
    from app.services import ai_grader
    monkeypatch.setattr(ai_grader.settings, "minimax_api_key", "")
    g = AIGrader(gateway=None)
    with pytest.raises(RuntimeError, match="MINIMAX_API_KEY"):
        asyncio.run(g.grade({"blockType": "short_answer", "question": "q",
                             "userAnswer": "a", "reference": "r"}))
