"""后端入口：python run.py

- 源码运行：cd backend && python run.py（默认 127.0.0.1:8000，可用 .env 的 BACKEND_HOST/BACKEND_PORT 覆盖）。
- 桌面打包：PyInstaller 以本文件为入口编译为可执行文件（uvicorn.run 直接传入 app 对象，
  PyInstaller 无需静态分析字符串导入）。
"""
import uvicorn

from app.config import settings
from app.main import app

if __name__ == "__main__":
    uvicorn.run(app, host=settings.backend_host, port=settings.backend_port, reload=False)