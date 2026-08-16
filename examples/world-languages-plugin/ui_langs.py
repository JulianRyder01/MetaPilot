# -*- coding: utf-8 -*-
"""界面语言（插件注册的界面语言 + 全量界面词典）。

每项：
- value:  语言代码（与核心 i18n Lang 约定一致，如 ja/ko/fr…）
- native: 该语言的自述名（Globe 下拉 / 设置页语言选择展示）
- dict:   界面词典（key 与核心词典一致；未覆盖词条由前端回退简体中文）

词典按语言拆分于 ui_dicts/ 下，本文件仅聚合导出；
界面语言清单随 ui_dicts/ 登记动态变化，核心与插件描述均不写死语言列表。
"""
from .ui_dicts import UI_LANGS  # noqa: F401
