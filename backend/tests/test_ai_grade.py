"""AI 判题服务测试：monkeypatch httpx 模拟 MiniMax 响应，验证 prompt 构造与解析。"""
import pytest

from app.services.ai_grader import AIGrader

VALID_JSON = '{"score": 82, "feedback": "回答正确，抓住了核心要点。", "isCorrect": true}'


class FakeResponse:
    def __init__(self, content: str, status: int = 200):
        self._content = content
        self.status_code = status

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")

    def json(self):
        return {"choices": [{"message": {"content": self._content}}]}


@pytest.mark.asyncio
async def test_grade_prompt_and_parse(monkeypatch):
    captured = {}

    class FakeClient:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, url, headers=None, json=None):
            captured["url"] = url
            captured["headers"] = headers
            captured["body"] = json
            assert json["response_format"] == {"type": "json_object"}
            prompt = json["messages"][0]["content"]
            assert "题型" not in prompt  # 验证用中文 prompt
            assert "采样定理" in prompt
            return FakeResponse(VALID_JSON)

    monkeypatch.setattr("app.services.ai_grader.httpx.AsyncClient", FakeClient)

    g = AIGrader(api_key="test-key")
    result = await g.grade({
        "blockType": "short_answer",
        "question": "简述采样定理",
        "reference": "采样频率应大于信号最高频率的两倍",
        "keywords": ["采样频率", "两倍"],
        "userAnswer": "采样频率要高于最高频率的2倍",
    })
    assert result["score"] == 82
    assert result["isCorrect"] is True
    assert "核心要点" in result["feedback"]
    assert "api.minimaxi.com" in captured["url"]
    assert captured["headers"]["Authorization"] == "Bearer test-key"


@pytest.mark.asyncio
async def test_parse_markdown_wrapped_json():
    text = '```json\n{"score": 45, "feedback": "部分正确", "isCorrect": false}\n```'
    result = AIGrader._parse_response(text)
    assert result["score"] == 45
    assert result["isCorrect"] is False


@pytest.mark.asyncio
async def test_parse_score_clamped():
    assert AIGrader._parse_response('{"score": 150, "feedback": "", "isCorrect": true}')["score"] == 100
    assert AIGrader._parse_response('{"score": -10, "feedback": "", "isCorrect": false}')["score"] == 0


def test_no_api_key_raises():
    g = AIGrader(api_key="")
    with pytest.raises(RuntimeError, match="MINIMAX_API_KEY"):
        import asyncio
        asyncio.run(g.grade({"blockType": "short_answer", "question": "q",
                             "userAnswer": "a", "reference": "r"}))
