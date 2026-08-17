"""核心设置路由：数据目录（vault）查看与迁移。

默认 vault = backend/data（可通过 .env 的 DATA_DIR 配置）。
迁移语义：把当前数据目录整体复制到新目录 → 校验关键文件一致 → 删除源文件 → 更新 .env；
数据目录在启动时加载，迁移后需重启后端生效。
"""
import os
import shutil
import sys
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.config import DATA_DIR, ENV_FILE, settings

router = APIRouter(prefix="/api/settings", tags=["settings"])


class VaultIn(BaseModel):
    path: str = Field(min_length=1)


def _env_set(key: str, value: str) -> None:
    """更新 .env 中的键值（无则追加）；.env 位置随 config.ENV_FILE（源码=项目根，桌面打包=用户数据目录）。"""
    env_path = ENV_FILE
    lines = env_path.read_text(encoding="utf-8").splitlines() if env_path.exists() else []
    out: list[str] = []
    replaced = False
    for ln in lines:
        if ln.strip().startswith(f"{key}="):
            out.append(f"{key}={value}")
            replaced = True
        else:
            out.append(ln)
    if not replaced:
        out.append(f"{key}={value}")
    env_path.write_text("\n".join(out) + "\n", encoding="utf-8")


@router.get("/vault")
def get_vault():
    """当前数据目录（vault）绝对路径；configured = 是否经 DATA_DIR 显式配置。"""
    return {"path": str(DATA_DIR.resolve()), "configured": bool(settings.data_dir)}


@router.post("/vault/reveal")
def reveal_vault():
    """在用户本机的系统文件管理器中显示当前数据目录（vault）。仅本机运行场景。"""
    import os
    import subprocess

    current = DATA_DIR.resolve()
    try:
        if os.name == "nt":
            os.startfile(str(current))  # type: ignore[attr-defined]
        elif sys.platform == "darwin":
            subprocess.Popen(["open", str(current)])
        else:
            subprocess.Popen(["xdg-open", str(current)])
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"打开失败：{e}")
    return {"ok": True, "path": str(current)}


@router.post("/vault/migrate")
def migrate_vault(body: VaultIn):
    """迁移 vault：整体复制到新目录 → 校验数据一致 → 删除源文件 → 更新 .env（重启生效）。"""
    current = DATA_DIR.resolve()
    target = Path(body.path).expanduser().resolve()
    if not target.exists() or not target.is_dir():
        raise HTTPException(status_code=400, detail="目标目录不存在")
    if target == current:
        raise HTTPException(status_code=400, detail="目标与当前数据目录相同")
    if str(target).startswith(str(current) + os.sep) or str(current).startswith(str(target) + os.sep):
        raise HTTPException(status_code=400, detail="目标不能是当前数据目录的子目录或父目录")
    if any(target.iterdir()):
        raise HTTPException(status_code=400, detail="目标目录必须为空（迁移会整体复制数据）")

    try:
        shutil.copytree(current, target, dirs_exist_ok=True)
        # 校验关键数据一致
        for rel in ("index.json", "libraries"):
            if not (target / rel).exists():
                raise RuntimeError(f"迁移校验失败：缺少 {rel}")
        # 数据完整后删除源文件（先复制后删除，保证移动前后一致）
        for child in current.iterdir():
            if child.is_dir():
                shutil.rmtree(child, ignore_errors=True)
            else:
                child.unlink(missing_ok=True)
        _env_set("DATA_DIR", str(target))
    except Exception as e:
        shutil.rmtree(target, ignore_errors=True)  # 清理失败副本，源数据保持不动
        raise HTTPException(status_code=500, detail=f"迁移失败：{e}")

    return {"path": str(target), "migrated": True, "restartRequired": True}
