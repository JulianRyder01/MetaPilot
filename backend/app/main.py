"""FastAPI 应用装配。"""
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .config import DATA_DIR
from .storage.progress import ProgressStore
from .storage.stats import StatsStore
from .storage.store import LibraryStore
from .api import ai, documents, libraries, plugins, progress, stats
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
app.state.progress = ProgressStore(DATA_DIR)
app.state.stats = StatsStore(DATA_DIR)

ASSETS_DIR = Path(DATA_DIR) / "assets" / "courses"
ASSETS_DIR.mkdir(parents=True, exist_ok=True)
app.state.importer = CourseImporter(app.state.store, ASSETS_DIR)

app.include_router(libraries.router)
app.include_router(documents.router)
app.include_router(progress.router)
app.include_router(stats.router)
app.include_router(ai.router)
app.include_router(plugins.router)

# 插件系统：扫描 backend/plugins/ 物理目录加载全部插件并挂载路由。
# 路由始终挂载；被禁用的插件由 requires_plugin 依赖在请求时返回 503 + 启用提示。
app.state.plugins = load_plugins(DATA_DIR)
for info in manager.list():
    plugin = manager.get(info["id"])
    if plugin is not None:
        plugin.register(app)

# 课程包动态交互块资产托管：/api/assets/courses/{cid}/interactives/xxx.html
app.mount("/api/assets/courses", StaticFiles(directory=str(ASSETS_DIR)), name="courses-assets")


@app.get("/api/health")
def health():
    return {"ok": True, "version": APP_VERSION, "dataDir": str(DATA_DIR)}
