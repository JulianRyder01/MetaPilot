"""FastAPI 应用装配。

MetaPilot 核心 = 文档库阅读器：库-文档集-文档-小节 的浏览与 Markdown 阅读、
Markdown 笔记导入、插件管理。课程/学习/知识库等能力由外部插件仓库（backend-plugins-repo）下的插件提供。
"""
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from .config import DATA_DIR, settings
from .version import VERSION as APP_VERSION
from .services.ai_config import AIConfig
from .services.ai_gateway import AIGateway
from .services.local_servers import LocalServersManager
from .services.ollama import OllamaClient
from .storage.store import LibraryStore
from .api import ai_chat, ai_settings, bulk, documents, kinds, libraries, mpf, notes, ollama, plugin_store, plugins, stats_core
from .api import settings as settings_router
from .plugins.base import manager
from .plugins.loader import load_plugins
from .services.importer import CourseImporter
from .services.mpf import register_core_mpf_types
from .services.stats_core import init_stats_core
from .stats_widgets import register_core_widgets


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
# 本机 ollama 集成（脱敏插件 / AI 洞察 ollama 模式共用；地址与模型取自 AI 配置）
app.state.ollama = OllamaClient(config=app.state.ai_gateway.config)

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
app.include_router(bulk.router)
app.include_router(notes.router)
app.include_router(plugins.router)
app.include_router(plugin_store.router)
app.include_router(stats_core.router)
app.include_router(settings_router.router)
app.include_router(mpf.router)
app.include_router(kinds.router)
app.include_router(ai_settings.router)
app.include_router(ai_chat.router)
app.include_router(ollama.router)

# 插件系统：扫描 PLUGINS_DIR（源码默认工作区平级 backend-plugins-repo，可被 METAPILOT_PLUGINS_DIR 覆盖）
# 物理目录加载全部插件并挂载路由。
# 路由始终挂载；被禁用的插件由 requires_plugin 依赖在请求时返回 503 + 启用提示。
app.state.plugins = load_plugins(DATA_DIR)
for info in manager.list():
    plugin = manager.get(info["id"])
    if plugin is not None:
        plugin.register(app)


@app.get("/api/health")
def health():
    return {"ok": True, "version": APP_VERSION, "dataDir": str(DATA_DIR)}


# ---------------- 桌面打包：托管前端构建产物（SPA） ----------------
# 前端 dist 目录由 Electron 通过 METAPILOT_FRONTEND_DIST 传入（打包后随应用资源目录携带）。
# 页面与 /api 同源，前端相对路径请求无需代理；未匹配 /api 的路径回退 index.html。
from fastapi.staticfiles import StaticFiles

FRONTEND_DIST = os.environ.get("METAPILOT_FRONTEND_DIST", "").strip()
if FRONTEND_DIST and Path(FRONTEND_DIST).is_dir():
    class SPAStaticFiles(StaticFiles):
        """SPA 静态托管：文件存在则返回文件，否则回退 index.html（/api 未命中仍返回 404 JSON）。"""

        async def get_response(self, path: str, scope):
            response = await super().get_response(path, scope)
            if response.status_code == 404:
                if path.startswith("api/"):
                    return JSONResponse({"detail": "Not Found"}, status_code=404)
                response = await super().get_response("index.html", scope)
            return response

    app.mount("/", SPAStaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")
    print(f"[main] 托管前端构建产物: {FRONTEND_DIST}")
