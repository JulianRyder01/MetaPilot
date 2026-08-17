// 项目截图脚本：启动后端 → 用 Electron 加载页面并 capturePage 截图
// 用法：node scripts/screenshot.mjs [输出PNG路径] [--port 18099]
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const outPath = args[0] || join(ROOT, "docs", "screenshot.png");
const port = Number(args[args.indexOf("--port") + 1] || 18099);

// 后端可执行（PyInstaller 产物优先，其次开发 python）
function backendCmd() {
  const exe = process.platform === "win32" ? "metapilot-backend.exe" : "metapilot-backend";
  const bundled = join(ROOT, "backend", "dist", "metapilot-backend", exe);
  if (existsSync(bundled)) {
    return { cmd: bundled, args: [], cwd: join(ROOT, "backend", "dist", "metapilot-backend") };
  }
  const python = process.platform === "win32" ? "python" : "python3";
  return { cmd: python, args: [join(ROOT, "backend", "run.py")], cwd: join(ROOT, "backend") };
}

const backend = backendCmd();
const proc = spawn(backend.cmd, backend.args, {
  cwd: backend.cwd,
  env: {
    ...process.env,
    BACKEND_HOST: "127.0.0.1",
    BACKEND_PORT: String(port),
    METAPILOT_FRONTEND_DIST: join(ROOT, "client", "dist"),
    METAPILOT_PLUGINS_DIR: join(ROOT, "backend", "plugins"),
    METAPILOT_SCRIPTS_DIR: join(ROOT, "backend", "scripts"),
    METAPILOT_DATA_DIR: join(ROOT, "data", "screenshot-tmp"),
  },
  stdio: "pipe",
});

let bootLog = "";
proc.stdout.on("data", (d) => (bootLog += d.toString()));
proc.stderr.on("data", (d) => (bootLog += d.toString()));

const waitHealth = async (retries = 60) => {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (res.ok) return true;
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`后端未就绪（${port}）:\n${bootLog}`);
};

// 用 Electron 截图：electron.exe -e "脚本" 方式
async function shoot() {
  const electronExe = join(ROOT, "electron", "node_modules", "electron", "dist",
    process.platform === "win32" ? "electron.exe" : "electron");
  if (!existsSync(electronExe)) throw new Error(`未找到 Electron 二进制: ${electronExe}（先运行 npm --prefix electron install 或打包脚本）`);

  const shotSrc = `
    const { app, BrowserWindow } = require("electron");
    const fs = require("fs");
    app.whenReady().then(async () => {
      const win = new BrowserWindow({ width: 1440, height: 900, show: false, webPreferences: { offscreen: true } });
      await win.loadURL("http://127.0.0.1:${port}");
      await new Promise((r) => setTimeout(r, 4000)); // 等首屏渲染
      const img = await win.webContents.capturePage();
      fs.writeFileSync(${JSON.stringify(outPath)}, img.toPNG());
      console.log("SHOT_DONE");
      app.exit(0);
    });
  `;
  const tmp = join(ROOT, ".probe", "shot-main.cjs");
  mkdirSync(join(ROOT, ".probe"), { recursive: true });
  writeFileSync(tmp, shotSrc);

  await new Promise((res, rej) => {
    const p = spawn(electronExe, [tmp], { stdio: "inherit", env: process.env });
    p.on("exit", (code) => (code === 0 ? res() : rej(new Error("electron 截图失败 code=" + code))));
    p.on("error", rej);
  })
    .catch(async (err) => {
      // 兜底：以 app 主进程方式跑（上述失败多半是 offscreen 环境问题）
      console.log("常规模式截图失败，试用窗口模式兜底:", err.message);
      writeFileSync(tmp, shotSrc.replace('offscreen: true, ', ''));
      await new Promise((res, rej) => {
        const p = spawn(electronExe, [tmp], { stdio: "inherit", env: process.env });
        p.on("exit", (code) => (code === 0 ? res() : rej(new Error("窗口模式截图也失败 code=" + code))));
        p.on("error", rej);
      });
    });

  rmSync(join(ROOT, ".probe"), { recursive: true, force: true });
}

try {
  await waitHealth();
  console.log("后端就绪，开始截图 →", outPath);
  await shoot();
  console.log("截图完成:", outPath, "（", existsSync(outPath) ? readFileSync(outPath).length + " bytes" : "不存在", "）");
} finally {
  proc.kill();
  if (process.platform === "win32") {
    try { spawnSync("taskkill", ["/pid", String(proc.pid), "/T", "/F"], { stdio: "ignore" }); } catch (_) {}
  }
}