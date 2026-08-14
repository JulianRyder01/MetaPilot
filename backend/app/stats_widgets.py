"""统计页组件注册表。

官方核心注册基础组件（访问/热力图/停留/字数），各插件可注册自己的统计组件。
组件清单经 GET /api/stats/widgets 暴露给前端；插件被禁用时前端隐藏其组件。
"""
from __future__ import annotations

_widgets: list[dict] = []


def register_widget(widget: dict) -> None:
    """widget: {id, title, source(插件id), description, defaultSize}"""
    for i, w in enumerate(_widgets):
        if w["id"] == widget["id"]:
            _widgets[i] = widget
            return
    _widgets.append(widget)


def list_widgets() -> list[dict]:
    return [dict(w) for w in _widgets]


# ---- 官方核心组件（启动时注册） ----

def register_core_widgets() -> None:
    register_widget({"id": "topDocs", "title": "最常访问的文档", "source": "core", "defaultSize": "lg",
                     "description": "按访问次数排序的文档 Top 10（核心提供）"})
    register_widget({"id": "heatmap", "title": "访问热力图", "source": "core", "defaultSize": "md",
                     "description": "月度日历 + 按小时分布的访问热力图（核心提供）"})
    register_widget({"id": "stayTime", "title": "文档停留时长", "source": "core", "defaultSize": "md",
                     "description": "各文档累计停留时长（核心提供）"})
    register_widget({"id": "wordCount", "title": "内容字数", "source": "core", "defaultSize": "md",
                     "description": "库内全部文档的总字数与分布（核心提供）"})
    register_widget({"id": "recentDocs", "title": "最近访问", "source": "core", "defaultSize": "md",
                     "description": "最近打开的文档列表（核心提供）"})
