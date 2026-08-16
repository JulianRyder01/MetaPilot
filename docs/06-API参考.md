# API 参考

> 基础地址：`http://127.0.0.1:8000`，统一前缀 `/api`。除文件上传外请求体均为 JSON。

## 1. 系统

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查 `{ok, version}` |
| GET | `/api/plugins` | 插件清单 `[{id, name, version, description, tags, source, enabled}]`，顺序：用户自定义 → 官方插件 → 官方核心 |

## 2. 插件商店

> 依赖 `.env` 的 `PLUGIN_STORE_URL`（未配置时返回 400 + 提示）。商店服务独立部署，见 `plugins-store/` 与 [04-插件开发指南.md](04-插件开发指南.md) §10。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/plugins/store/plugins` | 拉取商店插件清单（元数据 + tags + downloadUrl） |
| POST | `/api/plugins/store/plugins/{id}/install` | 从商店下载并安装为本地 user 插件（立即生效） |
| POST | `/api/plugins/upload` | 上传 zip 本地安装（multipart `file`，不经商店） |
| POST | `/api/plugins/store/publish` | 上传 zip 发布到商店（multipart `file`） |

## 3. 库 / 文件夹 / 文档 / 小节 / 块（内容 CRUD）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/libraries` | 库摘要列表 |
| POST | `/api/libraries` | 新建库 `{name, description}` |
| GET | `/api/libraries/{lid}` | 库完整树（含全部内容） |
| PUT | `/api/libraries/{lid}` | 更新库 |
| DELETE | `/api/libraries/{lid}` | 删除库 |
| POST | `/api/libraries/{lid}/folders` | 新建文件夹（课程）`{name, kind, description, author, version}` |
| GET | `/api/folders/{fid}` | 文件夹（课程）详情 |
| PUT | `/api/folders/{fid}` | 更新文件夹 |
| DELETE | `/api/folders/{fid}` | 删除文件夹 |
| POST | `/api/folders/{fid}/documents` | 新建文档（章节）`{name, docType}` |
| PUT | `/api/documents/{did}` | 更新文档 |
| DELETE | `/api/documents/{did}` | 删除文档 |
| POST | `/api/documents/{did}/sections` | 新建小节（知识点）`{name}` |
| PUT | `/api/sections/{sid}` | 更新小节（可整体替换 `blocks`） |
| DELETE | `/api/sections/{sid}` | 删除小节 |
| POST | `/api/sections/{sid}/blocks` | 添加组件块（见块类型） |
| PUT | `/api/blocks/{bid}` | 更新组件块 |
| DELETE | `/api/blocks/{bid}` | 删除组件块 |

块类型与字段见 [02-数据模型.md](02-数据模型.md)。

## 4. 学习进度（course 插件）

> 前缀 `/api/plugins/course/progress`（规范 §4 统一前缀）。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/plugins/course/progress/{cid}` | 该课程进度 `{completedSections, lastPosition}` |
| PUT | `/api/plugins/course/progress/{cid}/toggle/{sid}` | 切换某知识点学完状态，返回 `{completed}` |
| PUT | `/api/plugins/course/progress/{cid}/completed/{sid}?completed=true` | 显式设置 |
| PUT | `/api/plugins/course/progress/{cid}/position` | 记录上次位置 `{documentId, sectionId}` |

## 5. 学习统计（course 插件）

> 前缀 `/api/plugins/course/stats`。官方核心统计（访问/热力图等）见 `GET /api/stats/core/summary`、`POST /api/stats/core/visit`、`GET /api/stats/widgets`。

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/plugins/course/stats/sessions` | 上报学习时长 `{collectionId, documentId, sectionId, durationSec}` |
| GET | `/api/plugins/course/stats/summary?range=all\|today\|week\|month` | 汇总：总时长、每日分布、每课程分布 |

## 6. AI 判题（course 插件）

> 前缀 `/api/plugins/course/ai`。

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/plugins/course/ai/grade` | 主观题判分 `{blockType: fill_blank\|short_answer, question, reference, keywords[], blanks[], userAnswer}` → `{score, feedback, isCorrect}` |

未配置 `MINIMAX_API_KEY` 返回 503。

## 7. 课程插件（course）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/plugins/course/import` | multipart 上传 zip 课程包（可选 form 字段 `libraryId`）；同 `packageId` 自动替换 |
| GET | `/api/plugins/course/{cid}/export` | 导出课程 zip |
| POST | `/api/plugins/notes/import` | multipart 上传 `.md` 笔记；按二级标题分小节（核心能力，不属于插件） |
| GET | `/api/plugins/course/assets/{cid}/{file}` | 交互块资产（iframe 加载入口） |

## 7.5 AI 统一网关（核心 1.1.1，前缀 /api/ai）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/ai/config` | AI provider 配置（key 掩码）+ 本地模型状态 |
| PUT | `/api/ai/config` | 更新配置并写回 .env（apiKey 留空保持原值；含模型价格表与货币） |
| GET | `/api/ai/usage?range=` | AI 用量统计（all/today/week/month）：调用次数/token/成本，按模型分组 |
| GET | `/api/ai/local-models` | 内置本地模型状态（已下载/运行中） |
| POST | `/api/ai/local-models/download` | 后台下载本地模型（embedding/llm/rerank） |
| POST | `/api/ai/local-models/start` / `stop` | 启动/停止本地模型服务 |
| POST | `/api/ai/test` | 连通性测试（一次最小 chat 调用，计入用量） |

## 8. AI 洞察插件（ai_insight）

见 [05-AI洞察插件.md](05-AI洞察插件.md)：`resources` / `resources/symlink/{mid}/tree` / `index`（异步+进度） / `index/{key}/status` / `ask`（四模式） / `plan`（洞察规划生成） / `embedding-status` / `embedding/start` / `embedding/stop`，前缀 `/api/plugins/ai_insight`。

## 9. 错误约定

- 404：对象不存在；400：参数/格式错误；503：依赖服务未就绪（未配 Key、embedding 未启动）；502：上游调用失败。
- 错误体统一 `{"detail": "错误说明"}`（中文）。
