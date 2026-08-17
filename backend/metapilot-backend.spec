# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller 打包配置：把 FastAPI 后端编译为独立可执行文件（桌面 Electron 内置后端）。

用法（在项目根目录）：
    python -m pip install pyinstaller
    python -m PyInstaller backend/metapilot-backend.spec

产物：backend/dist/metapilot-backend/{metapilot-backend(.exe), _internal/...}
运行时目录约定（由打包脚本/Electron 设置环境变量）：
    METAPILOT_ROOT           应用资源根（插件/脚本等随包资源所在目录）
    METAPILOT_PLUGINS_DIR    插件物理目录（Electron 首次启动从资源复制到用户数据目录）
    METAPILOT_SCRIPTS_DIR    本地模型服务脚本目录
    METAPILOT_FRONTEND_DIST  前端构建产物 dist 目录（后端同源托管）
    METAPILOT_ENV_FILE       .env 文件路径（用户数据目录）
"""
from pathlib import Path

from PyInstaller.utils.hooks import collect_submodules

# 本项目根目录（spec 位于 backend/ 下；SPECPATH 即 spec 所在目录）
ROOT = Path(SPECPATH).resolve()

# 入口：backend/run.py
entry = str(ROOT / "run.py")

# 插件包动态导入（importlib.import_module("plugins.<id>")），PyInstaller 需静态收集全部子模块
# 与依赖的 app.* 子模块（routes/service 在 register 内延迟导入），避免运行时 ModuleNotFoundError。
hiddenimports = (
    collect_submodules("plugins")
    + collect_submodules("app")
    + ["uvicorn", "uvicorn.logging", "uvicorn.loops", "uvicorn.protocols",
       "uvicorn.protocols.http", "uvicorn.protocols.http.auto", "uvicorn.protocols.http.h11_impl",
       "uvicorn.protocols.http.httptools_impl", "uvicorn.lifespan", "uvicorn.lifespan.on",
       "uvicorn.lifespan.off", "uvicorn.loops.auto", "uvicorn.loops.asyncio", "uvicorn.loops.uvloop",
       "uvicorn.middleware", "uvicorn.middleware.proxy_headers", "uvicorn.middleware.message_logger",
       "uvicorn.middleware.wsgi", "uvicorn.middleware.asgi2", "uvicorn.supervisors"] 
)

a = Analysis(
    [entry],
    pathex=[str(ROOT)],
    binaries=[],
    datas=[
        # 内置插件目录（plugin.json / frontend.js / 课程资产等多字节文件）随包携带，
        # 运行时优先使用 METAPILOT_PLUGINS_DIR（用户数据目录，可写）中的副本。
        (str(ROOT / "plugins"), "plugins"),
        # 本地模型服务脚本（embedding/llm/rerank servers）随包携带
        (str(ROOT / "scripts"), "scripts"),
    ],
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="metapilot-backend",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,  # CI runner 上 upx 版本可能与 PyInstaller 不兼容，关闭更稳健
    console=True,  # 保留控制台便于诊断；正式发布可改 False
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,  # CI runner 上 upx 版本可能与 PyInstaller 不兼容，关闭更稳健
    upx_exclude=[],
    name="metapilot-backend",
)