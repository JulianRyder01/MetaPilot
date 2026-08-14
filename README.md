# MetaPilot

> 版本 **1.0.0** · 交互式学习网站 · 课程学习 / 个人笔记 / AI 洞察

MetaPilot 是一个把「学、练、玩」结合起来的交互式学习平台：

- **学**：每个知识点是一个组件流页面 —— Markdown 讲解、选择题/填空题/简答题（主观题由 AI 判分）、动态交互块（独立 HTML，可做物理模拟与可视化）。
- **练**：每章可标记学完，课程进度一目了然；学习进度独立缓存，随时回到上次学习的位置。
- **玩**：动态交互块让抽象的知识点变得可操作、可观察（如卷积可视化、频谱变换实验）。
- **库**：基础结构是「库 → 文档集 → 文档 → 小节」，课程只是其中一种文档集类型；还支持导入 Markdown / Obsidian 笔记，并用 AI 洞察查阅资料联系、问答溯源并生成图表/课程。

## 快速开始

### 1. 后端（FastAPI）

```bash
cd backend
pip install -r requirements.txt
# 首次使用：复制 .env 模板并填入 MiniMax API Key
cp ../.env.example ../.env
python run.py            # http://127.0.0.1:8000
```

### 2. 前端（React + Vite）

```bash
cd client
npm install
npm run dev              # http://localhost:5173
```

### 3. 导入官方课程（可选）

后端启动后，在客户端「库」页面选择「导入课程包」，选择 `courses/digital-image-processing/` 打包后的 zip 或目录即可。也可直接用 `courses/` 下的现成课程包。

## 功能清单

| 模块 | 说明 |
|---|---|
| 库浏览器 | Obsidian 风格文件浏览器：库-文档集-文档-小节 全层级管理 |
| 学习页 | 组件流渲染（markdown / 题目 / 交互块），左栏大纲导航，底部上/下一个知识点 |
| 主观题 AI 判分 | MiniMax-M3 对比用户输入与参考答案，输出准确率与评语 |
| 学习进度 | 每课程独立缓存：标记学完、上次学习位置、课程页打勾 |
| 学习统计 | 记录每节学习时长，支持 今日/本周/本月/全部 汇总 |
| 编辑模式 | 一切可改：库、文档集、章节、小节、题目与答案 |
| 课程包 | 独立打包、导入/更新课程；开发者可自行制作（见 docs/03） |
| AI 洞察插件 | 多粒度向量索引（库/文档集/文档/本机目录），四种思考模式与洞察规划生成图表/课程（docs/05） |
| 插件商店 | 独立部署的 plugins-store 服务：浏览/筛选/安装商店插件，上传自制插件（本地安装或发布商店） |
| 笔记导入 | 导入 Markdown / Obsidian 格式文档查看 |

## 目录结构

```
docs/        文档（架构、数据模型、课程制作、插件、知识库、API）
backend/     FastAPI 后端（含插件）
client/      React 前端
courses/     官方课程包（含动态交互块资产）
plugins-store/  插件应用商店（独立部署：清单/下载/上传，含插件开发规范副本）
```

详见 [docs/01-架构总览.md](docs/01-架构总览.md)。

## 技术栈

React 18 · Vite · TypeScript · Tailwind CSS · shadcn/ui · FastAPI · MiniMax-M3 · Qwen3-Embedding-0.6B

## 版本与发布

- 语义化版本，当前 1.0.0。
- 大核心修改（架构 / 数据格式变更）发布新版本；课程包 `manifest.json` 独立 `formatVersion` 演进。

## 敏感配置

所有密钥放在 `.env`（已 gitignore），模板见 `.env.example`。

## License

开源项目（持续开发中）。
