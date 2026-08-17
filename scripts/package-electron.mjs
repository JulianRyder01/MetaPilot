#!/usr/bin/env node
/**
 * MetaPilot 桌面端一键打包脚本（跨平台：Windows / macOS / Linux）。
 *
 * 用途：像 Obsidian/VSCode 一样把本仓库打包为 Electron 桌面应用安装包分发给各端 release。
 *
 * 版本号：基于官方核心插件版本号（backend/app/version.py，= 项目版本 = 桌面打包版本），
 * 不在此处硬编码；修改版本只改 backend/app/version.py。
 *
 * 用法：
 *   node scripts/package-electron.mjs            # 打包当前平台（win => nsis, mac => dmg, linux => AppImage+deb）
 *   node scripts/package-electron.mjs --win      # 仅 Windows
 *   node scripts/package-electron.mjs --mac      # 仅 macOS（需在 macOS 上执行）
 *   node scripts/package-electron.mjs --linux    # 仅 Linux（AppImage+deb）
 *   node scripts/package-electron.mjs --skip-backend   # 跳过 PyInstaller 后端编译（复用已有 resources/backend）
 *   node scripts/package-electron.mjs --skip-frontend  # 跳过前端构建（复用已有 client/dist）
 *
 * 前置：Node.js ≥ 18、npm、Python 3（含 pip）。PyInstaller 与 electron 依赖缺失时脚本自动安装。
 * 产物输出：electron/release/
 */
import { execSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ELECTRON_DIR = join(ROOT, "electron");
const RESOURCES_DIR = join(ELECTRON_DIR, "resources");
const CLIENT_DIR = join(ROOT, "client");
const BACKEND_DIR = join(ROOT, "backend");

// ---------- 参数 ----------
const args = process.argv.slice(2);
const TARGETS = [];
if (args.includes("--win")) TARGETS.push("win");
if (args.includes("--mac")) TARGETS.push("mac");
if (args.includes("--linux")) TARGETS.push("linux");
const SKIP_BACKEND = args.includes("--skip-backend");
const SKIP_FRONTEND = args.includes("--skip-frontend");
if (TARGETS.length === 0) {
  if (process.platform === "win32") TARGETS.push("win");
  else if (process.platform === "darwin") TARGETS.push("mac");
  else TARGETS.push("linux");
}

// ---------- 版本号：官方核心插件版本单一来源 ----------
const VERSION_FILE = join(BACKEND_DIR, "app", "version.py");
const versionSrc = readFileSync(VERSION_FILE, "utf-8");
const VERSION = (versionSrc.match(/^VERSION\s*=\s*["']([^"']+)["']/m) || [])[1];
if (!VERSION) {
  console.error(`无法从 ${VERSION_FILE} 解析版本号`);
  process.exit(1);
}
console.log(`\n=== MetaPilot 桌面打包 v${VERSION}（官方核心插件版本，单一来源 ${VERSION_FILE}）===\n`);

// ---------- 1. 前端构建 ----------
if (!SKIP_FRONTEND) {
  console.log("[1/5] 构建前端 client/dist ...");
  execSync("npm install", { cwd: CLIENT_DIR, stdio: "inherit" });
  execSync("npm run build", { cwd: CLIENT_DIR, stdio: "inherit" });
} else {
  console.log("[1/5] 跳过前端构建（--skip-frontend）");
}
const FRONTEND_DIST = join(CLIENT_DIR, "dist");
if (!existsSync(join(FRONTEND_DIST, "index.html"))) {
  console.error("缺少 client/dist/index.html，请先构建前端（或去掉 --skip-frontend）");
  process.exit(1);
}

// ---------- 2. 后端 PyInstaller 编译 ----------
console.log("[2/5] 编译后端（PyInstaller -> backend/dist/metapilot-backend/）...");
if (!SKIP_BACKEND) {
  const pyInstallerCheck = spawnSync("python", ["-m", "PyInstaller", "--version"], { encoding: "utf-8" });
  if (pyInstallerCheck.status !== 0) {
    console.log("  未检测到 PyInstaller，自动安装中 ...");
    execSync("python -m pip install pyinstaller", { stdio: "inherit" });
  }
  const spec = join(BACKEND_DIR, "metapilot-backend.spec");
  execSync(`python -m PyInstaller --noconfirm --clean --distpath "${join(BACKEND_DIR, "dist")}" --workpath "${join(BACKEND_DIR, "build", "pyinstaller")}" "${spec}"`, { stdio: "inherit" });
} else {
  console.log("  跳过后端编译（--skip-backend，复用已有产物）");
}
const BACKEND_OUT = join(BACKEND_DIR, "dist", "metapilot-backend");
const backendExe = process.platform === "win32" ? "metapilot-backend.exe" : "metapilot-backend";
if (!existsSync(join(BACKEND_OUT, backendExe))) {
  console.error(`缺少后端产物 ${join(BACKEND_OUT, backendExe)}，请先编译后端（或去掉 --skip-backend）`);
  process.exit(1);
}

// ---------- 3. 组装 electron/resources ----------
console.log("[3/5] 组装 electron/resources ...");
rmSync(RESOURCES_DIR, { recursive: true, force: true });
mkdirSync(RESOURCES_DIR, { recursive: true });
cpSync(BACKEND_OUT, join(RESOURCES_DIR, "backend"), { recursive: true });
cpSync(FRONTEND_DIST, join(RESOURCES_DIR, "frontend"), { recursive: true });
cpSync(join(BACKEND_DIR, "plugins"), join(RESOURCES_DIR, "plugins"), { recursive: true });
cpSync(join(BACKEND_DIR, "scripts"), join(RESOURCES_DIR, "scripts"), { recursive: true });
const envExample = join(ROOT, ".env.example");
if (existsSync(envExample)) cpSync(envExample, join(RESOURCES_DIR, ".env.example"));

// ---------- 4. 生成图标 + 版本号写入 package.json + electron-builder 打包 ----------
console.log("[4/5] 生成应用图标（electron/build/icon.png）...");
execSync(`node "${join(ROOT, "scripts", "generate-icon.mjs")}"`, { stdio: "inherit" });

console.log(`[5/5] 写入 version=${VERSION} 并运行 electron-builder（${TARGETS.join(", ")}） ...`);
const pkgPath = join(ELECTRON_DIR, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
pkg.version = VERSION;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

if (!existsSync(join(ELECTRON_DIR, "node_modules", "electron"))) {
  console.log("  安装 electron / electron-builder 依赖 ...");
  execSync("npm install", { cwd: ELECTRON_DIR, stdio: "inherit" });
}

const flags = TARGETS.map((t) => `--${t}`).join(" ");
const build = spawnSync(
  "npx",
  ["electron-builder", "--config", "electron-builder.yml", "--publish", "never", ...TARGETS.map((t) => `--${t}`)],
  { cwd: ELECTRON_DIR, stdio: "inherit", shell: process.platform === "win32" },
);
if (build.status !== 0) {
  console.error("electron-builder 失败");
  process.exit(build.status || 1);
}

console.log(`\n✓ 打包完成：electron/release/（MetaPilot-${VERSION}）`);
console.log("  分发：Windows 安装包 -> 分发 .exe（nsis）；macOS -> .dmg；Linux -> .AppImage / .deb");