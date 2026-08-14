"""Pydantic 请求/响应模型（API 输入校验）。"""
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class LibraryIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = ""


class CollectionIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    kind: Literal["course", "note", "kb", "canvas"] = "course"
    description: str = ""
    author: str = ""
    version: str = "1.0.0"


class DocumentIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str = Field(min_length=1, max_length=200)
    doc_type: Literal["study", "quiz", "note"] = Field(default="study", alias="docType")
    folder_id: Optional[str] = Field(default="", alias="folderId")


class FolderIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    parent_id: Optional[str] = Field(default="", alias="parentId")


class FolderUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    parent_id: Optional[str] = Field(default=None, alias="parentId")


class SectionIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    ref_doc_id: Optional[str] = Field(default="", alias="refDocId")


class BlockIn(BaseModel):
    """组件流单元输入：按 type 使用对应字段。"""

    type: Literal[
        "markdown",
        "single_choice",
        "multiple_choice",
        "fill_blank",
        "short_answer",
        "interactive",
    ]
    content: Optional[str] = None          # markdown
    question: Optional[str] = None         # 题目类
    options: Optional[list[str]] = None    # 选择题选项
    answer: Optional[int] = None           # 单选题正确项索引
    answers: Optional[list[int]] = None    # 多选题正确项索引集合
    blanks: Optional[list[str]] = None     # 填空题各空参考答案
    reference: Optional[str] = None        # 简答题参考答案
    explanation: Optional[str] = None      # 答案解析
    keywords: Optional[list[str]] = None   # 简答题关键词
    ai_graded: bool = True                 # 主观题是否走 AI 判题
    title: Optional[str] = None            # interactive
    file: Optional[str] = None             # interactive 资产相对路径（interactives/x.html）
    height: int = 480                      # interactive iframe 高度


class ReorderIn(BaseModel):
    ids: list[str]
