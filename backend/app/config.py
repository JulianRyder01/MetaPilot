"""应用配置：从 .env 读取。

路径语义：
- 源码运行：ROOT_DIR = 项目根目录（backend/app/config.py 上溯三级），.env 在项目根。
- 桌面打包（PyInstaller frozen）：ROOT_DIR 由环境变量 METAPILOT_ROOT 指定（Electron 传入应用资源目录）；
  .env 由 METAPILOT_ENV_FILE 指定（Electron 指向用户数据目录），数据目录默认用户数据目录（也支持 .env 的 DATA_DIR）。
"""
import os
import sys
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


def _env_or_default(key: str, default: Path) -> Path:
    """环境变量给出的路径 => Path；未设置/为空串 => 默认。"""
    raw = os.environ.get(key, "").strip()
    return Path(raw) if raw else default


FROZEN = bool(getattr(sys, "frozen", False))

if FROZEN:
    # 桌面打包：应用资源目录由 Electron 传入（含 plugins/scripts/frontend 等）
    ROOT_DIR = Path(os.environ.get("METAPILOT_ROOT") or Path(sys.executable).resolve().parent)
else:
    # 源码运行：backend/app/config.py → 上溯三级 = 项目根目录
    ROOT_DIR = Path(__file__).resolve().parents[2]

BACKEND_DIR = ROOT_DIR / "backend" if not FROZEN else ROOT_DIR

# .env 位置：源码在项目根；打包由 Electron 指向用户数据目录（无则回退资源目录）
ENV_FILE = _env_or_default("METAPILOT_ENV_FILE", ROOT_DIR / ".env")

# 数据目录（vault）：
# 优先级：.env 的 DATA_DIR（用户显式配置/迁移后写回，绝对路径优先）> METAPILOT_DATA_DIR（Electron 传入的 userData/data，桌面打包默认）
#         > 默认（源码=backend/data，打包=资源目录旁 data）。
# 桌面打包：Electron 首次铺 .env 模板时剥离其中的 DATA_DIR 相对路径行，数据默认落 userData/data（安装目录不可写、升级会被整体替换）；
# 用户经「设置 → 数据目录迁移」迁移后会在 .env 写回绝对路径 DATA_DIR，重启后优先生效。
METAPILOT_DATA_DIR = os.environ.get("METAPILOT_DATA_DIR", "").strip()


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(ENV_FILE),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # MiniMax AI
    minimax_api_key: str = ""
    minimax_base_url: str = "https://api.minimaxi.com/v1"
    minimax_model: str = "MiniMax-M3"

    # 本地 Embedding（个人知识库插件）
    embedding_provider: str = "local_transformers"
    embedding_url: str = "http://127.0.0.1:8760"
    embedding_model: str = "Qwen/Qwen3-Embedding-0.6B"
    conda_env: str = "Jyun"
    # 知识库插件首次访问时自动启动本地 embedding 服务（含首次模型下载）
    embedding_auto_start: bool = True

    # 后端
    backend_host: str = "127.0.0.1"
    backend_port: int = 8000
    data_dir: str = ""

    # 插件商店（独立部署的 plugins-store 服务；留空 = 关闭商店功能）
    plugin_store_url: str = ""


settings = Settings()
DATA_DIR = Path(settings.data_dir) if settings.data_dir else (
    Path(METAPILOT_DATA_DIR) if METAPILOT_DATA_DIR else (BACKEND_DIR / "data")
)