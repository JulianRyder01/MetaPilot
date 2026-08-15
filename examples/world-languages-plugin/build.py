# -*- coding: utf-8 -*-
"""世界语言插件打包脚本：把插件源码打成可安装的 zip（world-languages-plugin.zip）。

zip 内文件位于根目录（插件开发规范 §3/§6.2 约定）：
plugin.json / __init__.py / routes.py / languages.py / frontend/frontend.js
"""
import os
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "world-languages-plugin.zip")

FILES = [
    "plugin.json",
    "__init__.py",
    "routes.py",
    "languages.py",
    "frontend/frontend.js",
]


def main() -> None:
    if os.path.exists(OUT):
        os.remove(OUT)
    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as zf:
        for name in FILES:
            zf.write(os.path.join(HERE, name), name)
    with zipfile.ZipFile(OUT) as zf:
        names = zf.namelist()
    print(f"已生成 {OUT}")
    print("包含文件:", ", ".join(names))
    print(f"大小: {os.path.getsize(OUT)} bytes")


if __name__ == "__main__":
    main()
