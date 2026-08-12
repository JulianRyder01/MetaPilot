"""应用配置：从项目根目录的 .env 读取。"""
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parents[2]  # 项目根目录
BACKEND_DIR = ROOT_DIR / "backend"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ROOT_DIR / ".env",
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

    # 后端
    backend_host: str = "127.0.0.1"
    backend_port: int = 8000
    data_dir: str = ""


settings = Settings()
DATA_DIR = Path(settings.data_dir) if settings.data_dir else (BACKEND_DIR / "data")
