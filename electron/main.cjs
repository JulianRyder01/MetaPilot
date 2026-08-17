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
} else {
  mainEntry();
}

function mainEntry() {
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
    const dataDir = path.join(userData, "data");
    const pluginsDir = path.join(userData, "plugins");
    const envFile = path.join(userData, ".env");

    // 首次运行：把内置插件（resources/plugins）与 .env 模板（resources/.env.example）铺到用户数据目录
    ensureUserData(res, userData, dataDir, pluginsDir, envFile);

    return {
      cmd: path.join(backendDir, exeName),
      args: [],
      cwd: backendDir,
      env: {
        ...process.env,
        BACKEND_HOST: "127.0.0.1",
        BACKEND_PORT: String(port),
        METAPILOT_ROOT: backendDir,
        METAPILOT_DATA_DIR: dataDir,
        METAPILOT_FRONTEND_DIST: path.join(res, "frontend"),
        METAPILOT_PLUGINS_DIR: pluginsDir,
        METAPILOT_SCRIPTS_DIR: path.join(res, "scripts"),
        METAPILOT_ENV_FILE: envFile,
      },
    };
  }

  function ensureUserData(res, userData, dataDir, pluginsDir, envFile) {
    fs.mkdirSync(userData, { recursive: true });
    // 数据目录（vault）随 userData，安装目录不可写且升级会被整体替换
    fs.mkdirSync(dataDir, { recursive: true });
    // 内置插件 → 用户目录（用户可安装/删除插件，内置仅首次铺入）
    const builtinPlugins = path.join(res, "plugins");
    if (fs.existsSync(builtinPlugins) && !fs.existsSync(pluginsDir)) {
      fs.cpSync(builtinPlugins, pluginsDir, { recursive: true });
    }
    // .env 模板 → 用户目录；对已有 .env 也做 DATA_DIR 行净化。
    // 桌面版数据目录（vault）位置由 Electron 固定为 userData/data；模板里的相对路径 DATA_DIR=./data
    // 在打包环境下会相对 cwd=resources/backend 解析落到安装目录（升级/覆盖会被整体替换 → 数据丢失）。
    // 用户自定义数据位置用「设置 → 数据目录迁移」写回绝对路径后，此处保留（不破坏迁移结果）。
    const builtinEnv = path.join(res, ".env.example");
    if (fs.existsSync(builtinEnv)) {
      const sanitize = (content) => {
        return content
          .split(/\r?\n/)
          .filter((line) => {
            const m = line.match(/^[ \t]*DATA_DIR[ \t]*=[ \t]*(.*)[ \t]*$/i);
            if (!m) return true;
            const v = m[1].trim().replace(/^["']|["']$/g, ""); // 去首尾引号（dotenv 合法）
            if (!v) return false; // DATA_DIR= 空值剥离
            // 绝对路径保留：Windows 盘符 / UNC 共享 / Unix 根 / ~ 开头（~ 由后端 expanduser 展开）
            return /^([A-Za-z]:[\\/]|\\\\|[/~])/.test(v);
          })
          .join("\n");
      };
      if (!fs.existsSync(envFile)) {
        const template = fs.readFileSync(builtinEnv, "utf-8");
        fs.writeFileSync(envFile, sanitize(template), "utf-8");
      } else {
        // 存量 .env（升级场景）：若其中 DATA_DIR 是相对路径，剥离该行（防止数据落回安装目录）
        const existing = fs.readFileSync(envFile, "utf-8");
        const cleaned = sanitize(existing);
        if (cleaned !== existing) {
          fs.writeFileSync(envFile, cleaned, "utf-8");
          console.log(`[main] 已净化 ${envFile} 中的相对路径 DATA_DIR（桌面包数据位置固定为 ${dataDir}）`);
        }
      }
    }
  }

  function startBackend(port) {
    return new Promise((resolve, reject) => {
      const cmd = resolveBackendCommand(port);
      backendProc = spawn(cmd.cmd, cmd.args, {
        cwd: cmd.cwd,
        env: cmd.env,
        stdio: "pipe",
        // Unix 下让后端成为新进程组组长（detached 不影响父子 IO），退出时可按进程组整组回收
        detached: process.platform !== "win32",
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

  app.on("before-quit", () => {
    quitting = true;
    if (backendProc && backendProc.pid) {
      try {
        if (process.platform === "win32") {
          // 同步等待整个进程树被强杀后主进程再退出，避免后端残留孤儿进程
          spawnSync("taskkill", ["/pid", String(backendProc.pid), "/T", "/F"], { stdio: "ignore" });
        } else {
          // 后端以新进程组组长启动（detached），kill 负 PID 整组回收；POSIX kill 命令同步发送
          spawnSync("kill", ["-TERM", `-${backendProc.pid}`], { stdio: "ignore" });
        }
      } catch (_) { /* ignore */ }
    }
  });
}