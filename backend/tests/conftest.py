"""测试公共配置：pytest 收集阶段即禁用 embedding 服务自动启动。

app.main 的 lifespan 会在后端启动时自动拉起本地 embedding 服务进程（功能 2），
测试环境不拉起真实模型进程，故在收集阶段统一关闭该开关
（test_kb.py / test_plugins.py 顶部的同款设置保留以兼容单独运行）。
"""
from app.config import settings

settings.embedding_auto_start = False
