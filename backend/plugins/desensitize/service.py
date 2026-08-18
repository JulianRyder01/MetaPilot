"""脱敏插件核心服务：本地模型（ollama）识别敏感信息 + 开放替换/涂黑工具集。

流程（与前端约定，共三阶段）：
1. analyze：把文本/文档交给本地模型（ollama，默认 qwen3.5:4b 可改）输出 JSON 敏感清单
   [{"value": 原文敏感串, "type": 敏感类型}]，工具对这些 value 在原文中精确定位并返回
   start/end（供前端高亮「标出所有敏感信息」）。
2. apply：用户确认要脱敏的条目后，工具按确认条目对文本/markdown 用 ■（黑块）替换原文，
   并返回替换后的文本与发生替换的区间（spans）。
3. 文件（PDF/图片）：工具用黑色块涂黑敏感内容所在区域，输出新文件供下载。

「开放工具集」说明：文本替换（replace:text / replace:text:label）、PDF 涂黑（redact:pdf）、
图片涂黑（redact:image）均为插件内置的脱敏工具；AI 只负责输出 JSON 识别结果，具体替换由
工具执行。识别出的敏感类型由模型自由返回，本模块仅提供「类型别名 → 展示名」的可扩展映射，
未命中的类型原样展示（不写死、可动态扩充）。
"""
from __future__ import annotations

import io
import json
import re
from typing import Optional

from app.services.ai_config import AIConfig
from app.services.ollama import OllamaClient, OllamaError

# 敏感类型别名 → 展示名（可动态扩充：未知类型原样返回，不写死）
_TYPE_LABELS: dict[str, str] = {
    "phone": "手机号", "mobile": "手机号", "tel": "电话",
    "id": "证件号", "id_card": "身份证", "passport": "护照",
    "email": "邮箱", "name": "姓名", "address": "地址", "bank": "银行卡",
    "card": "银行卡", "account": "账号", "plate": "车牌", "ip": "IP",
    "other": "其他",
}

# 黑块字符（替换/涂黑的统一视觉单元）
BLACK = "█"


def type_label(t: str) -> str:
    return _TYPE_LABELS.get(t or "", t or "其他")


def _parse_json(text: str) -> dict:
    """稳健解析模型 JSON 输出：剥离 ```json 围栏、截取首个 { ... } 平衡块。"""
    txt = text.strip()
    if txt.startswith("```"):
        txt = re.sub(r"^```[a-zA-Z]*\s*", "", txt)
        txt = re.sub(r"\s*```$", "", txt).strip()
    try:
        return json.loads(txt)
    except Exception:
        pass
    # 截取平衡花括号
    start = txt.find("{")
    if start >= 0:
        depth = 0
        for i in range(start, len(txt)):
            if txt[i] == "{":
                depth += 1
            elif txt[i] == "}":
                depth -= 1
                if depth == 0:
                    try:
                        return json.loads(txt[start:i + 1])
                    except Exception:
                        break
    return {}


class DesensitizeService:
    """脱敏服务：识别 + 替换/涂黑工具端点所需，经 request.app.state.desensitize 取用。"""

    def __init__(self, ollama: Optional[OllamaClient] = None, config: Optional[AIConfig] = None):
        self.ollama = ollama or OllamaClient(config=config)
        self.config = config or self.ollama.config if hasattr(self.ollama, "config") else None

    # ---------------- 工具：文本替换（replace:text） ----------------

    @staticmethod
    def mask_text(text: str, items: list[dict]) -> tuple[str, list[dict]]:
        """把确认条目的敏感串替换为黑色块；返回 (替换后文本, 实际替换区间 spans)。

        定位策略：优先用条目自带 start/end（校验区间文本一致），否则按 value 在原文
        子串匹配（可命中多处）；重叠区间合并，保证不重复替换。
        """
        if not items or not text:
            return text, []
        spans: list[tuple[int, int, dict]] = []
        for it in items:
            v = str(it.get("value") or "").strip()
            if not v:
                continue
            s = it.get("start")
            e = it.get("end")
            added = False
            if isinstance(s, int) and isinstance(e, int):
                if 0 <= s < e <= len(text) and text[s:e] == v:
                    spans.append((s, e, it))
                    added = True
            if not added:
                pos = 0
                while True:
                    idx = text.find(v, pos)
                    if idx < 0:
                        break
                    spans.append((idx, idx + len(v), it))
                    pos = idx + len(v)
        if not spans:
            return text, []
        spans.sort(key=lambda x: (x[0], -x[1]))
        merged: list[tuple[int, int, dict]] = []
        for s, e, it in spans:
            if merged and s < merged[-1][1]:
                continue
            merged.append((s, e, it))
        out: list[str] = []
        last = 0
        result_spans: list[dict] = []
        for s, e, it in merged:
            out.append(text[last:s])
            value = text[s:e] or str(it.get("value"))
            out.append(BLACK * (e - s))
            result_spans.append({"start": s, "end": e, "value": value,
                                 "type": it.get("type", ""), "typeLabel": type_label(it.get("type", ""))})
            last = e
        out.append(text[last:])
        return "".join(out), result_spans

    # ---------------- 识别 ----------------

    def _system_prompt(self) -> str:
        return (
            "你是本地数据脱敏助手。阅读用户提供的文本，找出所有敏感信息，例如：姓名、手机号、"
            "身份证号、护照、邮箱、家庭/公司地址、银行卡/银行账号、车牌号、IP 地址等个人信息。\n"
            "只输出 JSON，不要任何其它文字或解释。格式："
            '{"items":[{"value":"敏感串，必须与原文完全一致","type":"类型英文标识"}]}。\n'
            "要求：value 必须逐字符与原文一致（用于精确定位并替换），不要改写、截断或省略；"
            "同一种若出现多次可各列一条；没有敏感信息时输出 {\"items\":[]}。"
        )

    async def analyze_text(self, text: str, model: str = "") -> dict:
        """用本地模型识别敏感信息，返回定位后的条目列表（含 start/end 与 found）。"""
        if not text or not text.strip():
            return {"items": [], "count": 0}
        model = model or self.ollama.llm_model
        messages = [
            {"role": "system", "content": self._system_prompt()},
            {"role": "user", "content": text},
        ]
        try:
            res = await self.ollama.chat(messages, model=model, json_mode=True, temperature=0)
        except OllamaError as e:
            raise RuntimeError(f"本地模型识别失败：{e}")
        data = _parse_json(res.get("content", ""))
        raw_items = data.get("items") if isinstance(data.get("items"), list) else []
        if not isinstance(raw_items, list):
            raw_items = []
        items = []
        for it in raw_items:
            if not isinstance(it, dict):
                continue
            v = str(it.get("value") or "").strip()
            if not v:
                continue
            t = str(it.get("type") or "").strip()
            st = it.get("start")
            en = it.get("end")
            found, s, e = self._locate(text, v, st, en)
            items.append({"value": v, "type": t, "typeLabel": type_label(t),
                          "start": s, "end": e, "found": found})
        return {"items": items, "count": len(items), "model": res.get("model", model)}

    @staticmethod
    def _locate(text: str, value: str, start=None, end=None) -> tuple[bool, int, int]:
        """返回 (是否定位到, 首处 start, end)；优先给定区间校验，否则子串查找，再宽松匹配。"""
        if isinstance(start, int) and isinstance(end, int):
            if 0 <= start < end <= len(text) and text[start:end] == value:
                return True, start, end
        idx = text.find(value)
        if idx >= 0:
            return True, idx, idx + len(value)
        # 宽松：去掉空白后再找（容忍模型混入空格）
        compact = re.sub(r"\s+", "", value)
        if compact:
            idx = text.find(compact)
            if idx >= 0:
                return True, idx, idx + len(value)
        return False, 0, 0

    # ---------------- 文件：PDF / 图片 ----------------

    @staticmethod
    def extract_pdf_text(data: bytes) -> dict:
        """用 pymupdf 提取 PDF 文本（每页文本 + 全文）；不可用时抛 RuntimeError。"""
        try:
            import fitz  # pymupdf
        except ImportError as e:  # pragma: no cover
            raise RuntimeError("未安装 pymupdf，无法处理 PDF（pip install pymupdf）") from e
        doc = fitz.open(stream=data, filetype="pdf")
        pages = []
        full = []
        for p in doc:
            t = p.get_text()
            pages.append(t)
            full.append(t)
        doc.close()
        return {"pages": pages, "text": "\n".join(full),
                "pageCount": len(pages), "kind": "pdf"}

    def extract_image_text(self, data: bytes) -> dict:
        """图片 OCR（可选 pytesseract）：返回文本与词级坐标表；OCR 不可用时返回空文本。"""
        try:
            import pytesseract
            from PIL import Image
        except ImportError:
            return {"text": "", "words": [], "ocr": False, "kind": "image"}
        try:
            img = Image.open(io.BytesIO(data))
            txt = pytesseract.image_to_string(img, lang="chi_sim+eng")
            data_boxes = pytesseract.image_to_data(img, output_type=pytesseract.Output.DICT)
        except Exception:
            return {"text": "", "words": [], "ocr": False, "kind": "image"}
        words = []
        n = len(data_boxes.get("text", []))
        for i in range(n):
            w = (data_boxes.get("text") or [""])[i]
            if not w or not w.strip():
                continue
            words.append({"word": w.strip(),
                          "x": data_boxes["left"][i], "y": data_boxes["top"][i],
                          "w": data_boxes["width"][i], "h": data_boxes["height"][i]})
        return {"text": txt, "words": words, "ocr": True, "kind": "image"}

    # ---------------- 工具：PDF / 图片涂黑 ----------------

    @staticmethod
    def redact_pdf(data: bytes, values: list[str]) -> bytes:
        """把 PDF 中每个敏感串出现的位置涂成黑色块，返回新 PDF。"""
        try:
            import fitz
        except ImportError as e:  # pragma: no cover
            raise RuntimeError("未安装 pymupdf，无法涂黑 PDF（pip install pymupdf）") from e
        doc = fitz.open(stream=data, filetype="pdf")
        for page in doc:
            rects = []
            pr = page.rect
            for v in values:
                if not v:
                    continue
                for r in page.search_for(v):
                    clip = fitz.Rect(r) & pr
                    if not clip.is_empty:
                        rects.append(clip)
            if rects:
                for clip in rects:
                    page.add_redact_annot(clip, fill=(0, 0, 0))
                page.apply_redactions()
        buf = io.BytesIO()
        doc.save(buf, garbage=3, deflate=True)
        doc.close()
        return buf.getvalue()

    @staticmethod
    def redact_image(data: bytes, regions: Optional[list[list[int]]] = None,
                     full: bool = False) -> bytes:
        """把图片指定矩形或整张涂成黑块，返回新图字节（保留原格式；PNG 兜底）。"""
        try:
            from PIL import Image, ImageDraw
        except ImportError as e:  # pragma: no cover
            raise RuntimeError("未安装 Pillow，无法涂黑图片（pip install Pillow）") from e
        img = Image.open(io.BytesIO(data))
        fmt = (img.format or "PNG").upper()
        if fmt in ("", "JPEG", "JPG"):
            rgb = img.convert("RGB")
        else:
            rgb = img.convert("RGBA") if img.mode in ("RGBA", "LA") or "A" in (img.getbands() or ()) else img.convert("RGB")
        draw = ImageDraw.Draw(rgb)
        if full or not regions:
            draw.rectangle([0, 0, rgb.width, rgb.height], fill=(0, 0, 0))
        else:
            for reg in regions:
                if len(reg) != 4:
                    continue
                x0, y0, x1, y1 = reg
                draw.rectangle([x0, y0, x1, y1], fill=(0, 0, 0))
        buf = io.BytesIO()
        rgb.save(buf, format="PNG" if fmt in ("JPEG", "JPG") else fmt)
        return buf.getvalue()
