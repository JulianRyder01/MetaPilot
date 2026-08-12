"""FastAPI 应用装配。

MetaPilot 核心 = 文档库阅读器：库-文档集-文档-小节 的浏览与 Markdown 阅读、
Markdown 笔记导入、插件管理。课程/学习/知识库等能力由 backend/plugins/ 下的插件提供。
"""
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import DATA_DIR
from .storage.store import LibraryStore
from .api import documents, libraries, notes, plugins
from .plugins.base import manager
from .plugins.loader import load_plugins
from .services.importer import CourseImporter

APP_VERSION = "1.0.0"

app = FastAPI(title="MetaPilot", version=APP_VERSION)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.state.store = LibraryStore(DATA_DIR)

ASSETS_DIR = Path(DATA_DIR) / "assets" / "courses"
ASSETS_DIR.mkdir(parents=True, exist_ok=True)
app.state.importer = CourseImporter(app.state.store, ASSETS_DIR)

app.include_router(libraries.router)
app.include_router(documents.router)
app.include_router(notes.router)
app.include_router(plugins.router)

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
