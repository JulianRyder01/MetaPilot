// MetaPilot 桌面端主进程（Electron）
// 职责：启动后端（开发=系统 python 源码 / 生产=随包 PyInstaller 可执行文件）→ 等待就绪 → 加载页面 → 退出清理。
const { app, BrowserWindow } = require("electron");
const { spawn, spawnSync } = require("child_process");
const net = require("net");
const path = require("path");
const fs = require("fs");

const IS_DEV = !!process.env.METAPILOT_DEV_MODE;
const APP_VERSION = require("./package.json").version;

// 单实例锁：防止双击启动多个实例（多实例会各启一个后端并并发铺用户数据目录）
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

let backendProc = null;
let mainWindow = null;
let failed = false;
let quitting = false;

// ---------- 端口 ----------
function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

// ---------- 后端启动 ----------
function resolveBackendCommand(port) {
  if (IS_DEV) {
    // 开发模式：用系统 python 跑源码后端（backend/run.py）
    const root = path.resolve(__dirname, "..");
    const python = process.env.METAPILOT_PYTHON || (process.platform === "win32" ? "python" : "python3");
    return {
      cmd: python,
      args: [path.join(root, "backend", "run.py")],
      cwd: path.join(root, "backend"),
      env: {
        ...process.env,
        BACKEND_HOST: "127.0.0.1",
        BACKEND_PORT: String(port),
        METAPILOT_FRONTEND_DIST: path.join(root, "client", "dist"),
        METAPILOT_PLUGINS_DIR: path.join(root, "backend", "plugins"),
        METAPILOT_SCRIPTS_DIR: path.join(root, "backend", "scripts"),
      },
    };
  }
  // 生产模式：随包 PyInstaller 产物（electron-builder extraResources -> resources/backend/）
  const res = process.resourcesPath;
  const exeName = process.platform === "win32" ? "metapilot-backend.exe" : "metapilot-backend";
  const backendDir = path.join(res, "backend");
  const userData = app.getPath("userData");
  const pluginsDir = path.join(userData, "plugins");
  const envFile = path.join(userData, ".env");

  // 首次运行：把内置插件（resources/plugins）与 .env 模板（resources/.env.example）铺到用户数据目录
  ensureUserData(res, userData, pluginsDir, envFile);

  return {
    cmd: path.join(backendDir, exeName),
    args: [],
    cwd: backendDir,
    env: {
      ...process.env,
      BACKEND_HOST: "127.0.0.1",
      BACKEND_PORT: String(port),
      METAPILOT_ROOT: backendDir,
      METAPILOT_DATA_DIR: path.join(userData, "data"),
      METAPILOT_FRONTEND_DIST: path.join(res, "frontend"),
      METAPILOT_PLUGINS_DIR: pluginsDir,
      METAPILOT_SCRIPTS_DIR: path.join(res, "scripts"),
      METAPILOT_ENV_FILE: envFile,
    },
  };
}

function ensureUserData(res, userData, pluginsDir, envFile) {
  fs.mkdirSync(userData, { recursive: true });
  // 数据目录（vault）随 userData，安装目录不可写且升级会被整体替换
  fs.mkdirSync(path.join(userData, "data"), { recursive: true });
  // 内置插件 → 用户目录（用户可安装/删除插件，内置仅首次铺入）
  const builtinPlugins = path.join(res, "plugins");
  if (fs.existsSync(builtinPlugins) && !fs.existsSync(pluginsDir)) {
    fs.cpSync(builtinPlugins, pluginsDir, { recursive: true });
  }
  // .env 模板 → 用户目录（已有则不覆盖，避免覆盖用户配置）
  const builtinEnv = path.join(res, ".env.example");
  if (fs.existsSync(builtinEnv) && !fs.existsSync(envFile)) {
    fs.copyFileSync(builtinEnv, envFile);
  }
}

function startBackend(port) {
  return new Promise((resolve, reject) => {
    const cmd = resolveBackendCommand(port);
    backendProc = spawn(cmd.cmd, cmd.args, {
      cwd: cmd.cwd,
      env: cmd.env,
      stdio: "pipe",
    });
    let log = "";
    const collect = (buf) => { log += buf.toString(); };
    if (backendProc.stdout) backendProc.stdout.on("data", collect);
    if (backendProc.stderr) backendProc.stderr.on("data", collect);
    backendProc.on("error", (err) => reject(new Error(`后端启动失败: ${err.message}\n${log}`)));
    backendProc.on("exit", (code) => {
      // 正常退出流程（before-quit 里已置 quitting）不当作崩溃
      if (!quitting && !failed) {
        console.error(`后端进程退出(code=${code})\n${log}`);
        app.exit(code || 1);
      }
    });
    // 轮询 /api/health 直至就绪
    const base = `http://127.0.0.1:${port}`;
    const deadline = Date.now() + 60_000;
    const tick = () => {
      fetch(`${base}/api/health`)
        .then((r) => (r.ok ? resolve(base) : retry()))
        .catch(() => retry());
    };
    const retry = () => {
      if (Date.now() > deadline) {
        reject(new Error(`后端就绪超时\n${log}`));
      } else {
        setTimeout(tick, 500);
      }
    };
    setTimeout(tick, 300);
  });
}

// ---------- 窗口 ----------
function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    title: `MetaPilot v${APP_VERSION}`,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadURL(url);
  mainWindow.on("closed", () => { mainWindow = null; });
}

// ---------- 生命周期 ----------
app.whenReady().then(async () => {
  try {
    const port = await findFreePort();
    const base = await startBackend(port);
    createWindow(base);
  } catch (err) {
    failed = true;
    console.error(err);
    app.quit();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// 单实例锁：二次启动时聚焦已有窗口
app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.on("before-quit", (e) => {
  quitting = true;
  if (backendProc && backendProc.pid) {
    try {
      if (process.platform === "win32") {
        // 同步等待整个进程树被强杀后主进程再退出，避免后端残留孤儿进程
        spawnSync("taskkill", ["/pid", String(backendProc.pid), "/T", "/F"], { stdio: "ignore" });
      } else {
        process.kill(-backendProc.pid, "SIGTERM");
      }
    } catch (_) { /* ignore */ }
  }
});