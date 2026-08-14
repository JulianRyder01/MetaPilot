"""插件商店客户端：从独立部署的 plugins-store 服务拉取清单 / 下载 / 发布插件包。

商店地址由 .env 的 PLUGIN_STORE_URL 配置（config.settings.plugin_store_url），
留空时商店功能关闭（相关接口返回 400 + 提示）。
"""
from __future__ import annotations

import httpx

from ..config import settings

# 测试注入用：设置后 AsyncClient 使用该 transport（httpx.MockTransport）
_transport: httpx.AsyncBaseTransport | None = None


class PluginStoreError(Exception):
    """插件商店访问/操作失败。"""


def _base() -> str:
    url = (settings.plugin_store_url or "").rstrip("/")
    if not url:
        raise PluginStoreError("未配置 PLUGIN_STORE_URL，无法访问插件商店（见 .env.example）")
    return url


def _client(timeout: float) -> httpx.AsyncClient:
    if _transport is not None:
        return httpx.AsyncClient(transport=_transport, timeout=timeout)
    return httpx.AsyncClient(timeout=timeout)


async def fetch_catalog() -> list[dict]:
    """拉取商店插件清单（元数据 + tags + downloadUrl）。"""
    try:
        async with _client(10) as c:
            r = await c.get(f"{_base()}/api/store/plugins")
            r.raise_for_status()
            return r.json()
    except PluginStoreError:
        raise
    except httpx.HTTPError as e:
        raise PluginStoreError(f"无法连接插件商店: {e}") from e


async def download_package(pid: str) -> bytes:
    """下载插件包 zip 字节。"""
    try:
        async with _client(30) as c:
            r = await c.get(f"{_base()}/api/store/plugins/{pid}/download")
            r.raise_for_status()
            return r.content
    except httpx.HTTPError as e:
        raise PluginStoreError(f"下载插件 {pid} 失败: {e}") from e


async def publish_package(data: bytes, filename: str) -> dict:
    """把插件包提交到商店（校验由商店执行）。"""
    try:
        async with _client(30) as c:
            r = await c.post(
                f"{_base()}/api/store/plugins/upload",
                files={"file": (filename, data, "application/zip")},
            )
            if r.status_code >= 400:
                detail = r.json().get("detail") if r.headers.get("content-type", "").startswith("application/json") else r.text
                raise PluginStoreError(f"商店拒绝发布: {detail}")
            return r.json()
    except PluginStoreError:
        raise
    except httpx.HTTPError as e:
        raise PluginStoreError(f"发布到插件商店失败: {e}") from e
