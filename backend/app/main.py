"""FastAPI 应用装配。

MetaPilot 核心 = 文档库阅读器：库-文档集-文档-小节 的浏览与 Markdown 阅读、
Markdown 笔记导入、插件管理。课程/学习/知识库等能力由 backend/plugins/ 下的插件提供。
"""
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import DATA_DIR, settings
from .services.ai_config import AIConfig
from .services.ai_gateway import AIGateway
from .services.local_servers import LocalServersManager
from .storage.store import LibraryStore
from .api import ai_settings, documents, kinds, libraries, mpf, notes, plugin_store, plugins, stats_core
from .plugins.base import manager
from .plugins.loader import load_plugins
from .services.importer import CourseImporter
from .services.mpf import register_core_mpf_types
from .services.stats_core import init_stats_core
from .stats_widgets import register_core_widgets

APP_VERSION = "1.1.2"


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 本地向量服务随后端启动后台自动加载（不阻塞启动）：
    # 若服务进程已存活（如上次后端退出后遗留）则直接复用，退出重进不再重新加载。
    gw: AIGateway = app.state.ai_gateway
    if settings.embedding_auto_start and gw.config.embedding_provider == "local_transformers":
        try:
            res = app.state.local_servers.start("embedding", wait_ready=False)
            print(f"[main] embedding 服务: {res.get('message', res)}")
        except Exception as e:
            print(f"[main] 自动启动 embedding 服务失败: {e}")
    yield


app = FastAPI(title="MetaPilot", version=APP_VERSION, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.state.store = LibraryStore(DATA_DIR)

# 统一 AI 网关（核心 1.1.1）：所有插件经此中转调用 AI，密钥与地址不出核心
app.state.ai_gateway = AIGateway(DATA_DIR, AIConfig())
# 统一本地模型服务管理（向量 / 对话 / 重排，下载与启停）
app.state.local_servers = LocalServersManager(app.state.ai_gateway.config)

ASSETS_DIR = Path(DATA_DIR) / "assets" / "courses"
ASSETS_DIR.mkdir(parents=True, exist_ok=True)
app.state.importer = CourseImporter(app.state.store, ASSETS_DIR)

# 官方核心统计：访问记录 + 统计页 core 组件
init_stats_core(DATA_DIR, app.state.store)
register_core_widgets()
# 官方核心 .mpf 解析：doc / canvas 类型
register_core_mpf_types()

app.include_router(libraries.router)
app.include_router(documents.router)
app.include_router(notes.router)
app.include_router(plugins.router)
app.include_router(plugin_store.router)
app.include_router(stats_core.router)
app.include_router(mpf.router)
app.include_router(kinds.router)
app.include_router(ai_settings.router)

# 插件系统：扫描 backend/plugins/ 物理目录加载全部插件并挂载路由。
# 路由始终挂载；被禁用的插件由 requires_plugin 依赖在请求时返回 503 + 启用提示。
app.state.plugins = load_plugins(DATA_DIR)
for info in manager.list():
    plugin = manager.get(info["id"])
    if plugin is not None:
        plugin.register(app)


@app.get("/api/health")
def health():
    return {"ok": True, "version": APP_VERSION, "dataDir": str(DATA_DIR)}
