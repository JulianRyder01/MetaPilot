"""脱敏插件测试：开放替换工具（mask_text）、PDF/图片涂黑、ollama 识别（用假 ollama）、路由。

不依赖真实 ollama / 文档：针对 desensitize.service 的工具函数做单测，用 FakeOllama 替换
app.state.desensitize.ollama 驱动识别与路由，pymupdf/Pillow 只做非常小的内存读写。
"""
import json

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

SAMPLE = ("联系人：张三，电话 13800138000，邮箱 zhangsan@example.com，"
          "住址：北京市朝阳区某某路 88 号，身份证 110101199003078888。")


class FakeOllama:
    """假 ollama：html 仅返回固定识别 JSON；不真正联网。"""

    llm_model = "qwen3.5:4b"
    embedding_model = "nomic-embed-text"
    url = "http://127.0.0.1:11434"

    async def chat(self, messages, model="", json_mode=False, temperature=0.2, max_tokens=None):
        payload = {"items": [
            {"value": "13800138000", "type": "phone"},
            {"value": "张三", "type": "name"},
            {"value": "zhangsan@example.com", "type": "email"},
            {"value": "北京市朝阳区某某路 88 号", "type": "address"},
        ]}
        return {"content": json.dumps(payload, ensure_ascii=False),
                "model": model or self.llm_model, "done": True}

    async def health(self):
        return True

    async def list_models(self):
        return [{"name": self.llm_model}]


@pytest.fixture(autouse=True)
def _fake_ollama():
    old = app.state.desensitize.ollama
    app.state.desensitize.ollama = FakeOllama()
    yield
    app.state.desensitize.ollama = old


# ---------------- 开放替换工具 ----------------

def test_mask_text_basic():
    from plugins.desensitize.service import DesensitizeService
    masked, spans = DesensitizeService.mask_text(SAMPLE,
                                                 [{"value": "13800138000", "type": "phone"},
                                                  {"value": "张三", "type": "name"}])
    assert "13800138000" not in masked and "张三" not in masked
    assert "█" * 11 in masked  # 11 位手机号
    assert len(spans) == 2
    # phone 的 span 命中原文
    phone = next(s for s in spans if s["value"] == "13800138000")
    assert SAMPLE[phone["start"]:phone["end"]] == "13800138000"


def test_mask_text_multi_occurrence_and_overlap():
    from plugins.desensitize.service import DesensitizeService
    text = "张三和张三见面，电话 13800138000。"
    masked, spans = DesensitizeService.mask_text(text, [{"value": "张三"}])
    # 两处"张三"都被替换
    assert masked.count("█") == 4
    assert len(spans) == 2


def test_mask_text_respects_span():
    from plugins.desensitize.service import DesensitizeService
    text = "abc张三def"
    masked, spans = DesensitizeService.mask_text(
        text, [{"value": "张三", "start": 3, "end": 5}])
    assert masked == "abc██def"


# ---------------- 识别 ----------------

def test_analyze_text_locate():
    import asyncio
    from plugins.desensitize.service import DesensitizeService
    svc = DesensitizeService(ollama=app.state.desensitize.ollama)
    res = asyncio.run(svc.analyze_text(SAMPLE))
    assert res["count"] == 4
    # 每条都定位到原文
    for it in res["items"]:
        assert it["found"] is True
        assert SAMPLE[it["start"]:it["end"]] == it["value"]
    # 类型中文标签映射
    types = {it["type"]: it["typeLabel"] for it in res["items"]}
    assert types["phone"] == "手机号"


def test_routes_analyze_and_apply():
    r = client.post("/api/plugins/desensitize/analyze", json={"text": SAMPLE})
    assert r.status_code == 200
    body = r.json()
    assert body["count"] == 4

    items = body["items"][:2]
    r2 = client.post("/api/plugins/desensitize/apply", json={"text": SAMPLE, "items": items})
    assert r2.status_code == 200
    out = r2.json()
    for it in items:
        assert it["value"] not in out["text"]
    assert out["masked"] is True


def test_routes_status():
    r = client.get("/api/plugins/desensitize/status")
    assert r.status_code == 200
    body = r.json()
    assert body["ollamaHealthy"] is True
    assert body["model"] == "qwen3.5:4b"


# ---------------- PDF / 图片涂黑 ----------------

def _make_pdf_with_text():
    import fitz
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 72), "Phone 13800138000 email a@b.com", fontsize=12)
    buf = doc.tobytes()
    doc.close()
    return buf


def test_redact_pdf():
    import fitz
    from plugins.desensitize.service import DesensitizeService
    data = _make_pdf_with_text()
    out = DesensitizeService.redact_pdf(data, ["13800138000"])
    assert isinstance(out, bytes) and len(out) > 0
    doc = fitz.open(stream=out, filetype="pdf")
    page = doc[0]
    # 涂黑后该手机号不再可检索到（文字被移除/遮挡）
    hits = page.search_for("13800138000")
    doc.close()
    assert len(hits) == 0


def test_redact_image_full_and_region():
    # 本机 Pillow 可能缺 libpng 编码器，故用 BMP（系统内置编码器）构造/校验
    from io import BytesIO
    from PIL import Image
    from plugins.desensitize.service import DesensitizeService
    img = Image.new("RGB", (100, 50), (255, 255, 255))
    bio = BytesIO()
    img.save(bio, format="BMP")
    data = bio.getvalue()

    full = DesensitizeService.redact_image(data, full=True)
    out = Image.open(BytesIO(full))
    assert out.getpixel((50, 25)) == (0, 0, 0)

    reg = DesensitizeService.redact_image(data, regions=[[10, 10, 20, 20]])
    out2 = Image.open(BytesIO(reg))
    assert out2.getpixel((15, 15)) == (0, 0, 0)
    assert out2.getpixel((90, 40)) == (255, 255, 255)
