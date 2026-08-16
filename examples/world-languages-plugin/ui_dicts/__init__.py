# -*- coding: utf-8 -*-
"""界面语言词典聚合：各语言文件定义 UI_DICT（key 与核心词典一致），此处汇总为 UI_LANGS。

新增界面语言：在 ui_dicts/ 下新增 <code>.py（定义 UI_DICT）并在本文件登记一行即可；
插件元数据描述中不写死语言列表，由本聚合与后端 /ui-langs 接口动态决定。
"""
from .de import UI_DICT as DE
from .es import UI_DICT as ES
from .fr import UI_DICT as FR
from .ja import UI_DICT as JA
from .ko import UI_DICT as KO
from .ru import UI_DICT as RU

UI_LANGS = [
    {"value": "ja", "native": "日本語", "dict": JA},
    {"value": "ko", "native": "한국어", "dict": KO},
    {"value": "fr", "native": "Français", "dict": FR},
    {"value": "de", "native": "Deutsch", "dict": DE},
    {"value": "es", "native": "Español", "dict": ES},
    {"value": "ru", "native": "Русский", "dict": RU},
]
