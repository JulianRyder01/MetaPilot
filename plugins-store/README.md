# MetaPilot 插件商店（plugins-store）

MetaPilot 的**插件应用商店**：独立部署在一台服务器上，提供插件清单、下载与上传接口。
MetaPilot 主后端（`backend/`）通过配置 `PLUGIN_STORE_URL` 从这里获取插件（见主仓库
`docs/04-插件开发规范.md` §10）。

## 快速启动（本机开发）

```bash
cd plugins-store
pip install -r requirements.txt
python run.py            # http://127.0.0.1:8100
```

- 交互式 API 文档：http://127.0.0.1:8100/docs
- 插件清单：`GET /api/store/plugins`
- 上传插件：`POST /api/store/plugins/upload`（multipart `file`，zip 内须含根目录 `plugin.json`）

## 单独部署（服务器）

### 方式一：Docker（推荐）

```bash
cd plugins-store
docker build -t metapilot-plugins-store .
docker run -d -p 8100:8100 -v $(pwd)/store/data:/app/store/data --name plugins-store metapilot-plugins-store
```

> 数据目录 `store/data/`（`packages/*.zip` + `index.json`）通过 volume 持久化。

### 方式二：裸机（uvicorn）

```bash
cd plugins-store
pip install -r requirements.txt
uvicorn store.main:app --host 0.0.0.0 --port 8100
```

### 接入主后端

主后端 `.env` 配置商店地址后，插件页「插件商店」即可浏览/安装/发布：

```bash
PLUGIN_STORE_URL=http://<商店服务器IP>:8100
```

## API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/` | 商店信息 |
| GET | `/api/store/health` | 健康检查 |
| GET | `/api/store/plugins` | 插件清单（元数据 + tags + downloadUrl） |
| GET | `/api/store/plugins/{id}/download` | 下载插件包 zip |
| POST | `/api/store/plugins/upload` | 上传插件包 zip（校验 plugin.json、tags 白名单、id 路径净化） |

## 开发规范查阅

插件开发规范见 [docs/04-插件开发规范.md](docs/04-插件开发规范.md)
（与主仓库 `docs/04-插件开发指南.md` 同步，v1.0.0 起为「插件开发规范」）。

## 测试

```bash
cd plugins-store
python -m pytest tests/ -q
```
