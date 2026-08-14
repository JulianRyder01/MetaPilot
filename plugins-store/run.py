"""MetaPilot 插件商店入口。

单独部署在一台服务器上（见 README.md），提供插件清单/下载/上传接口，
MetaPilot 主后端通过 PLUGIN_STORE_URL 从这里获取插件。
"""
import uvicorn

if __name__ == "__main__":
    uvicorn.run("store.main:app", host="0.0.0.0", port=8100)
