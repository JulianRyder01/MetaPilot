"""FastAPI 应用装配。"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import DATA_DIR
from .storage.progress import ProgressStore
from .storage.stats import StatsStore
from .storage.store import LibraryStore
from .api import documents, libraries, progress, stats

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

app.include_router(libraries.router)
app.include_router(documents.router)
app.include_router(progress.router)
app.include_router(stats.router)


@app.get("/api/health")
def health():
    return {"ok": True, "version": APP_VERSION, "dataDir": str(DATA_DIR)}
