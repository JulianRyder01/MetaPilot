"""Pydantic 请求/响应模型（API 输入校验）。"""
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class LibraryIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = ""
    # 置顶标记（可多个）：PUT 更新时可选传入
    pinned: Optional[bool] = None


class DefaultTargetIn(BaseModel):
    """默认保存目标（库 / 软链接统一，唯一）：AI 洞察等插件的默认保存位置。"""
    kind: Literal["library", "symlink"]
    id: str = Field(min_length=1)


class FolderIn(BaseModel):
    """顶层文件夹（原文档集：课程/图表/笔记等）。kind 放开为任意字符串（由核心/插件解释）。"""
    name: str = Field(min_length=1, max_length=200)
    kind: str = "note"
    description: str = ""
    author: str = ""
    version: str = "1.0.0"


class FolderPatch(BaseModel):
    """文件夹更新（顶层/嵌套通用）：传什么更新什么；顶层忽略 parentId，嵌套忽略 kind 等。"""
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    kind: Optional[str] = None
    description: Optional[str] = None
    author: Optional[str] = None
    version: Optional[str] = None
    packageId: Optional[str] = None
    parentId: Optional[str] = None
    canvas: Optional[dict] = None
    convertedFrom: Optional[str] = None
    convertedAt: Optional[str] = None


class SubfolderIn(BaseModel):
    """嵌套文件夹（顶层文件夹内的目录层级）。"""
    name: str = Field(min_length=1, max_length=200)
    parent_id: Optional[str] = Field(default="", alias="parentId")


class SubfolderUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    parent_id: Optional[str] = Field(default=None, alias="parentId")


class DocumentIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str = Field(min_length=1, max_length=200)
    doc_type: Literal["study", "quiz", "note"] = Field(default="study", alias="docType")
    folder_id: Optional[str] = Field(default="", alias="folderId")


class SectionIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    ref_doc_id: Optional[str] = Field(default="", alias="refDocId")


class BlockIn(BaseModel):
    """组件流单元输入：按 type 使用对应字段（type 由插件/核心注册表解释，不在此枚举写死）。"""

    type: str
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
