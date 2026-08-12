# API 参考

> 基础地址：`http://127.0.0.1:8000`，统一前缀 `/api`。除文件上传外请求体均为 JSON。

## 1. 系统

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查 `{ok, version}` |
| GET | `/api/plugins` | 插件清单 `[{id, name, version, description, enabled}]` |

## 2. 库 / 文档集 / 文档 / 小节 / 块（内容 CRUD）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/libraries` | 库摘要列表 |
| POST | `/api/libraries` | 新建库 `{name, description}` |
| GET | `/api/libraries/{lid}` | 库完整树（含全部内容） |
| PUT | `/api/libraries/{lid}` | 更新库 |
| DELETE | `/api/libraries/{lid}` | 删除库 |
| POST | `/api/libraries/{lid}/collections` | 新建文档集（课程）`{name, kind, description, author, version}` |
| GET | `/api/collections/{cid}` | 文档集（课程）详情 |
| PUT | `/api/collections/{cid}` | 更新文档集 |
| DELETE | `/api/collections/{cid}` | 删除文档集 |
| POST | `/api/collections/{cid}/documents` | 新建文档（章节）`{name, docType}` |
| PUT | `/api/documents/{did}` | 更新文档 |
| DELETE | `/api/documents/{did}` | 删除文档 |
| POST | `/api/documents/{did}/sections` | 新建小节（知识点）`{name}` |
| PUT | `/api/sections/{sid}` | 更新小节（可整体替换 `blocks`） |
| DELETE | `/api/sections/{sid}` | 删除小节 |
| POST | `/api/sections/{sid}/blocks` | 添加组件块（见块类型） |
| PUT | `/api/blocks/{bid}` | 更新组件块 |
| DELETE | `/api/blocks/{bid}` | 删除组件块 |

块类型与字段见 [02-数据模型.md](02-数据模型.md)。

## 3. 学习进度

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/progress/{cid}` | 该课程进度 `{completedSections, lastPosition}` |
| PUT | `/api/progress/{cid}/toggle/{sid}` | 切换某知识点学完状态，返回 `{completed}` |
| PUT | `/api/progress/{cid}/completed/{sid}?completed=true` | 显式设置 |
| PUT | `/api/progress/{cid}/position` | 记录上次位置 `{documentId, sectionId}` |

## 4. 学习统计

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/stats/sessions` | 上报学习时长 `{collectionId, documentId, sectionId, durationSec}` |
| GET | `/api/stats/summary?range=all\|today\|week\|month` | 汇总：总时长、每日分布、每课程分布 |

## 5. AI 判题（MiniMax-M3）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/ai/grade` | 主观题判分 `{blockType: fill_blank\|short_answer, question, reference, keywords[], blanks[], userAnswer}` → `{score, feedback, isCorrect}` |

未配置 `MINIMAX_API_KEY` 返回 503。

## 6. 课程插件（course）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/plugins/course/import` | multipart 上传 zip 课程包（可选 form 字段 `libraryId`）；同 `packageId` 自动替换 |
| GET | `/api/plugins/course/{cid}/export` | 导出课程 zip |
| POST | `/api/plugins/notes/import` | multipart 上传 `.md` 笔记；按二级标题分小节 |
| GET | `/api/assets/courses/{cid}/{file}` | 交互块资产（iframe 加载入口） |

## 7. 个人知识库插件（knowledge_base）

见 [05-个人知识库插件.md](05-个人知识库插件.md)：`embedding-status` / `embedding/start` / `{cid}/status` / `{cid}/index` / `{cid}/ask`。

## 8. 错误约定

- 404：对象不存在；400：参数/格式错误；503：依赖服务未就绪（未配 Key、embedding 未启动）；502：上游调用失败。
- 错误体统一 `{"detail": "错误说明"}`（中文）。
