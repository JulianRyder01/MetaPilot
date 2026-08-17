"""项目版本单一来源：官方核心插件（core）版本号 = 项目版本 = 桌面打包版本。

- 后端 main.py 的 APP_VERSION 引用此处；
- 官方核心插件 PluginManager._core_info() 的 version 引用此处；
- Electron 打包脚本读取此处作为应用版本号。

改动版本只需改这一个文件，各端自动跟随。
"""
VERSION = "1.1.4"