# 世界语言插件（world_languages）

**用户自定义插件**：按当前界面语言展示全世界主要语言 —— 界面称呼 + 该语言本国人民的自称（autonym），
例如中文界面下「英语（English）」。

- 插件类型：`user`（可禁用、可删除）
- 语言数量：插件后端内置一份语言目录（覆盖全球各区域与若干人工语言，可持续扩充）
- 交互：前端页面实时调用插件后端 `/api/plugins/world_languages/languages` 拉取语言数据（真实数据，非 mock）；
  界面语言切换后，页面经宿主 i18n 桥（`window.MetaPilotI18n`）自动刷新展示。

## 目录结构

```text
world-languages-plugin/
├── plugin.json        # 元数据（唯一来源）
├── __init__.py        # Plugin 实例（id 与 register）
├── routes.py          # 后端路由 /api/plugins/world_languages/languages（带门禁）
├── languages.py       # 语言目录数据（code / autonym / 三语称呼 / region）
├── frontend/
│   └── frontend.js    # 前端 bundle：注册路由 /languages、顶栏导航与词典
├── build.py           # 打包脚本（生成 world-languages-plugin.zip）
└── README.md
```

## 打包

```bash
cd examples/world-languages-plugin
python build.py        # 生成 world-languages-plugin.zip
```

zip 内含：`plugin.json`、`__init__.py`、`routes.py`、`languages.py`、`frontend/frontend.js`。

## 安装（二选一）

1. **本地插件页**：进入「插件管理 → 本地插件」，使用页面上方的「上传插件（本地安装）」卡片选择 zip 安装；
2. **插件商店页**：进入「插件管理 → 插件商店」，在「上传插件」卡片中选择 zip 并点「本地安装」。

安装后立即生效：顶栏出现「语言」导航（图标 Languages），点击进入 `/languages` 页面。
可在「插件管理 → 本地插件」中禁用或删除本插件（删除会物理移除，不可恢复）。

## 与宿主的解耦

本插件完全自包含，未安装/删除后，MetaPilot 核心不残留任何与本插件相关的代码、数据或行为；
前端仅依赖宿主的两项**通用协议**（与任何具体插件无关）：
- `window.MetaPilotPluginRegistry.register`（第三方插件注册入口，见插件开发规范 §6.2）；
- `window.MetaPilotI18n`（宿主通用 i18n 桥：`getLang` / `translate` / `subscribe`，见插件开发规范 §6.2）。

语言目录数据随插件后端提供，插件禁用时接口返回 503 提示，页面显示加载失败提示而非伪造数据。
