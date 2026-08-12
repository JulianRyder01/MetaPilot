"""主题插件数据：5 套特色视觉主题。

每个主题是一组 CSS 变量（覆盖 shadcn/ui 变量体系），分 light / dark 两套，
与「黑夜/白天」模式叠加生效：前端将变量以 inline style 注入 documentElement。
--radius / --destructive 等保持默认，主题只调整配色。

结构：
{
  id: 主题唯一标识（作为 html[data-theme] 值）
  name / description: 展示用
  preview: { bg, primary } 两个色块，供前端主题面板预览
  variables: { light: {...}, dark: {...} } 需覆盖的 CSS 变量
}
"""
from __future__ import annotations

# 需要随主题变化的 CSS 变量（其余沿用 index.css 默认值）
COMMON_KEYS = (
    "--background", "--foreground",
    "--card", "--card-foreground",
    "--popover", "--popover-foreground",
    "--primary", "--primary-foreground",
    "--secondary", "--secondary-foreground",
    "--muted", "--muted-foreground",
    "--accent", "--accent-foreground",
    "--destructive",
    "--border", "--input", "--ring",
    "--chart-1", "--chart-2", "--chart-3", "--chart-4", "--chart-5",
    "--sidebar", "--sidebar-foreground",
    "--sidebar-primary", "--sidebar-primary-foreground",
    "--sidebar-accent", "--sidebar-accent-foreground",
    "--sidebar-border", "--sidebar-ring",
)

THEMES: list[dict] = [
    {
        "id": "chinese",
        "name": "中国风 · 丹青",
        "description": "宣纸米白、朱砂丹红与黛墨，东方雅韵",
        "preview": {"bg": "#f7f2e9", "primary": "#b03a2e"},
        "variables": {
            "light": {
                "--background": "#f7f2e9", "--foreground": "#33291f",
                "--card": "#fdfaf3", "--card-foreground": "#33291f",
                "--popover": "#fdfaf3", "--popover-foreground": "#33291f",
                "--primary": "#b03a2e", "--primary-foreground": "#fdf6ee",
                "--secondary": "#efe7d8", "--secondary-foreground": "#4a3b2b",
                "--muted": "#f0eadc", "--muted-foreground": "#7a6a55",
                "--accent": "#e7dcc6", "--accent-foreground": "#4a3b2b",
                "--destructive": "#c0392b",
                "--border": "#e0d5bf", "--input": "#d8ccb4", "--ring": "#b03a2e",
                "--chart-1": "#b03a2e", "--chart-2": "#2f6d5a", "--chart-3": "#b8873a",
                "--chart-4": "#7a5c8f", "--chart-5": "#a05c2e",
                "--sidebar": "#f0e9da", "--sidebar-foreground": "#33291f",
                "--sidebar-primary": "#b03a2e", "--sidebar-primary-foreground": "#fdf6ee",
                "--sidebar-accent": "#e7dcc6", "--sidebar-accent-foreground": "#4a3b2b",
                "--sidebar-border": "#e0d5bf", "--sidebar-ring": "#b03a2e",
            },
            "dark": {
                "--background": "#221c15", "--foreground": "#e9dfc9",
                "--card": "#2a231a", "--card-foreground": "#e9dfc9",
                "--popover": "#2a231a", "--popover-foreground": "#e9dfc9",
                "--primary": "#c6554a", "--primary-foreground": "#fdf6ee",
                "--secondary": "#362d21", "--secondary-foreground": "#e9dfc9",
                "--muted": "#362d21", "--muted-foreground": "#a8967d",
                "--accent": "#403524", "--accent-foreground": "#e9dfc9",
                "--destructive": "#d9534f",
                "--border": "#4a3f2f", "--input": "#574a36", "--ring": "#c6554a",
                "--chart-1": "#c6554a", "--chart-2": "#5a9a86", "--chart-3": "#d4a04c",
                "--chart-4": "#9b7ab8", "--chart-5": "#c07a45",
                "--sidebar": "#282019", "--sidebar-foreground": "#e9dfc9",
                "--sidebar-primary": "#c6554a", "--sidebar-primary-foreground": "#fdf6ee",
                "--sidebar-accent": "#403524", "--sidebar-accent-foreground": "#e9dfc9",
                "--sidebar-border": "#4a3f2f", "--sidebar-ring": "#c6554a",
            },
        },
    },
    {
        "id": "vaporwave",
        "name": "霓虹蒸汽波",
        "description": "荧光粉紫与深海青，复古未来主义赛博配色",
        "preview": {"bg": "#150d2b", "primary": "#ff5fa2"},
        "variables": {
            "light": {
                "--background": "#f5f0fc", "--foreground": "#2b1f42",
                "--card": "#fcfaff", "--card-foreground": "#2b1f42",
                "--popover": "#fcfaff", "--popover-foreground": "#2b1f42",
                "--primary": "#d63384", "--primary-foreground": "#fff0f7",
                "--secondary": "#eadff8", "--secondary-foreground": "#3d2d63",
                "--muted": "#efe7fa", "--muted-foreground": "#7c6ba0",
                "--accent": "#ddcdf5", "--accent-foreground": "#3d2d63",
                "--destructive": "#e5484d",
                "--border": "#d9c8f2", "--input": "#cfbcec", "--ring": "#d63384",
                "--chart-1": "#d63384", "--chart-2": "#00c2a8", "--chart-3": "#8b5cf6",
                "--chart-4": "#ff8fab", "--chart-5": "#f59e0b",
                "--sidebar": "#efe5fa", "--sidebar-foreground": "#2b1f42",
                "--sidebar-primary": "#d63384", "--sidebar-primary-foreground": "#fff0f7",
                "--sidebar-accent": "#ddcdf5", "--sidebar-accent-foreground": "#3d2d63",
                "--sidebar-border": "#d9c8f2", "--sidebar-ring": "#d63384",
            },
            "dark": {
                "--background": "#150d2b", "--foreground": "#f2e9ff",
                "--card": "#1f1540", "--card-foreground": "#f2e9ff",
                "--popover": "#1f1540", "--popover-foreground": "#f2e9ff",
                "--primary": "#ff5fa2", "--primary-foreground": "#2a0f22",
                "--secondary": "#2a1d52", "--secondary-foreground": "#f2e9ff",
                "--muted": "#2a1d52", "--muted-foreground": "#a896d6",
                "--accent": "#34246a", "--accent-foreground": "#f2e9ff",
                "--destructive": "#ff6b6b",
                "--border": "#46337f", "--input": "#553f96", "--ring": "#ff5fa2",
                "--chart-1": "#ff5fa2", "--chart-2": "#22e0c8", "--chart-3": "#a78bfa",
                "--chart-4": "#ff9ecb", "--chart-5": "#fbbf24",
                "--sidebar": "#1b1236", "--sidebar-foreground": "#f2e9ff",
                "--sidebar-primary": "#ff5fa2", "--sidebar-primary-foreground": "#2a0f22",
                "--sidebar-accent": "#34246a", "--sidebar-accent-foreground": "#f2e9ff",
                "--sidebar-border": "#46337f", "--sidebar-ring": "#ff5fa2",
            },
        },
    },
    {
        "id": "bamboo",
        "name": "清新绿竹",
        "description": "竹绿与嫩青，自然呼吸感的清新配色",
        "preview": {"bg": "#f5faf2", "primary": "#3d8b52"},
        "variables": {
            "light": {
                "--background": "#f5faf2", "--foreground": "#22311f",
                "--card": "#fbfef8", "--card-foreground": "#22311f",
                "--popover": "#fbfef8", "--popover-foreground": "#22311f",
                "--primary": "#3d8b52", "--primary-foreground": "#f2fbf3",
                "--secondary": "#e7f1e2", "--secondary-foreground": "#36502f",
                "--muted": "#ecf4e8", "--muted-foreground": "#6b8264",
                "--accent": "#dcead5", "--accent-foreground": "#36502f",
                "--destructive": "#d9534f",
                "--border": "#d5e5cc", "--input": "#c9dcbf", "--ring": "#3d8b52",
                "--chart-1": "#3d8b52", "--chart-2": "#2e7d6b", "--chart-3": "#7ba84a",
                "--chart-4": "#a87b3a", "--chart-5": "#5b8c5a",
                "--sidebar": "#eef7e8", "--sidebar-foreground": "#22311f",
                "--sidebar-primary": "#3d8b52", "--sidebar-primary-foreground": "#f2fbf3",
                "--sidebar-accent": "#dcead5", "--sidebar-accent-foreground": "#36502f",
                "--sidebar-border": "#d5e5cc", "--sidebar-ring": "#3d8b52",
            },
            "dark": {
                "--background": "#131b12", "--foreground": "#dcead9",
                "--card": "#1b2519", "--card-foreground": "#dcead9",
                "--popover": "#1b2519", "--popover-foreground": "#dcead9",
                "--primary": "#67b37e", "--primary-foreground": "#0f1f13",
                "--secondary": "#243224", "--secondary-foreground": "#dcead9",
                "--muted": "#243224", "--muted-foreground": "#93a88d",
                "--accent": "#2c3d2c", "--accent-foreground": "#dcead9",
                "--destructive": "#e06c68",
                "--border": "#39503a", "--input": "#43604a", "--ring": "#67b37e",
                "--chart-1": "#67b37e", "--chart-2": "#4fae9c", "--chart-3": "#96c15f",
                "--chart-4": "#d0a34f", "--chart-5": "#7cb17e",
                "--sidebar": "#182117", "--sidebar-foreground": "#dcead9",
                "--sidebar-primary": "#67b37e", "--sidebar-primary-foreground": "#0f1f13",
                "--sidebar-accent": "#2c3d2c", "--sidebar-accent-foreground": "#dcead9",
                "--sidebar-border": "#39503a", "--sidebar-ring": "#67b37e",
            },
        },
    },
    {
        "id": "business",
        "name": "商务简洁",
        "description": "藏青蓝与中性灰，克制高效的办公风格",
        "preview": {"bg": "#ffffff", "primary": "#1d4ed8"},
        "variables": {
            "light": {
                "--background": "#ffffff", "--foreground": "#1b2537",
                "--card": "#ffffff", "--card-foreground": "#1b2537",
                "--popover": "#ffffff", "--popover-foreground": "#1b2537",
                "--primary": "#1d4ed8", "--primary-foreground": "#ffffff",
                "--secondary": "#f1f5f9", "--secondary-foreground": "#334155",
                "--muted": "#f4f6f8", "--muted-foreground": "#64748b",
                "--accent": "#e8eef7", "--accent-foreground": "#334155",
                "--destructive": "#dc2626",
                "--border": "#e2e8f0", "--input": "#cbd5e1", "--ring": "#1d4ed8",
                "--chart-1": "#1d4ed8", "--chart-2": "#0ea5e9", "--chart-3": "#10b981",
                "--chart-4": "#f59e0b", "--chart-5": "#8b5cf6",
                "--sidebar": "#f8fafc", "--sidebar-foreground": "#1b2537",
                "--sidebar-primary": "#1d4ed8", "--sidebar-primary-foreground": "#ffffff",
                "--sidebar-accent": "#e8eef7", "--sidebar-accent-foreground": "#334155",
                "--sidebar-border": "#e2e8f0", "--sidebar-ring": "#1d4ed8",
            },
            "dark": {
                "--background": "#0f172a", "--foreground": "#e2e8f0",
                "--card": "#172033", "--card-foreground": "#e2e8f0",
                "--popover": "#172033", "--popover-foreground": "#e2e8f0",
                "--primary": "#3b82f6", "--primary-foreground": "#ffffff",
                "--secondary": "#1e293b", "--secondary-foreground": "#e2e8f0",
                "--muted": "#1e293b", "--muted-foreground": "#94a3b8",
                "--accent": "#273449", "--accent-foreground": "#e2e8f0",
                "--destructive": "#ef4444",
                "--border": "#2b3a52", "--input": "#3b4b66", "--ring": "#3b82f6",
                "--chart-1": "#3b82f6", "--chart-2": "#38bdf8", "--chart-3": "#34d399",
                "--chart-4": "#fbbf24", "--chart-5": "#a78bfa",
                "--sidebar": "#111a2e", "--sidebar-foreground": "#e2e8f0",
                "--sidebar-primary": "#3b82f6", "--sidebar-primary-foreground": "#ffffff",
                "--sidebar-accent": "#273449", "--sidebar-accent-foreground": "#e2e8f0",
                "--sidebar-border": "#2b3a52", "--sidebar-ring": "#3b82f6",
            },
        },
    },
    {
        "id": "starry",
        "name": "星夜",
        "description": "深夜蓝紫与星光金，静谧浩瀚的夜空配色",
        "preview": {"bg": "#0a0f24", "primary": "#8b8bf5"},
        "variables": {
            "light": {
                "--background": "#f3f4fb", "--foreground": "#252b47",
                "--card": "#fbfbfe", "--card-foreground": "#252b47",
                "--popover": "#fbfbfe", "--popover-foreground": "#252b47",
                "--primary": "#5b5bd6", "--primary-foreground": "#ffffff",
                "--secondary": "#e8eaf7", "--secondary-foreground": "#3a4168",
                "--muted": "#edeefa", "--muted-foreground": "#737a9e",
                "--accent": "#dfe2f5", "--accent-foreground": "#3a4168",
                "--destructive": "#e5484d",
                "--border": "#d5d9ee", "--input": "#c8cde8", "--ring": "#5b5bd6",
                "--chart-1": "#5b5bd6", "--chart-2": "#7c3aed", "--chart-3": "#0ea5e9",
                "--chart-4": "#eab308", "--chart-5": "#ec4899",
                "--sidebar": "#ebedf9", "--sidebar-foreground": "#252b47",
                "--sidebar-primary": "#5b5bd6", "--sidebar-primary-foreground": "#ffffff",
                "--sidebar-accent": "#dfe2f5", "--sidebar-accent-foreground": "#3a4168",
                "--sidebar-border": "#d5d9ee", "--sidebar-ring": "#5b5bd6",
            },
            "dark": {
                "--background": "#0a0f24", "--foreground": "#dbe2ff",
                "--card": "#121a38", "--card-foreground": "#dbe2ff",
                "--popover": "#121a38", "--popover-foreground": "#dbe2ff",
                "--primary": "#8b8bf5", "--primary-foreground": "#14132e",
                "--secondary": "#1a2248", "--secondary-foreground": "#dbe2ff",
                "--muted": "#1a2248", "--muted-foreground": "#8b93c4",
                "--accent": "#222c58", "--accent-foreground": "#dbe2ff",
                "--destructive": "#f0607a",
                "--border": "#2c3770", "--input": "#3a4686", "--ring": "#8b8bf5",
                "--chart-1": "#8b8bf5", "--chart-2": "#a78bfa", "--chart-3": "#38bdf8",
                "--chart-4": "#eab308", "--chart-5": "#f472b6",
                "--sidebar": "#0d1430", "--sidebar-foreground": "#dbe2ff",
                "--sidebar-primary": "#8b8bf5", "--sidebar-primary-foreground": "#14132e",
                "--sidebar-accent": "#222c58", "--sidebar-accent-foreground": "#dbe2ff",
                "--sidebar-border": "#2c3770", "--sidebar-ring": "#8b8bf5",
            },
        },
    },
]


def validate_theme(theme: dict) -> None:
    """校验主题数据完整性（注册时与测试时共用）。"""
    assert theme["id"], "主题缺少 id"
    assert theme["name"], "主题缺少 name"
    preview = theme.get("preview", {})
    assert preview.get("bg") and preview.get("primary"), f"主题 {theme['id']} 缺少 preview 色"
    for mode in ("light", "dark"):
        variables = theme["variables"].get(mode)
        assert variables, f"主题 {theme['id']} 缺少 {mode} 变量"
        assert set(COMMON_KEYS) == set(variables.keys()), (
            f"主题 {theme['id']} 的 {mode} 变量集合不完整"
        )
