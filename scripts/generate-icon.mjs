// 生成 MetaPilot 桌面端图标 electron/build/icon.png（512x512，无第三方依赖）
// 设计：深蓝渐变底 + 中央白色“M”/书页抽象 —— 品牌占位图标，可被 `electron/build/icon.png` 替换。
// electron-builder 会从 icon.png 自动生成各平台 ico/icns。
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SIZE = 512;
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "electron");

// ---- 像素绘制 ----
const px = new Uint8Array(SIZE * SIZE * 4); // RGBA

function blend(x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
  const i = (y * SIZE + x) * 4;
  const na = a / 255;
  px[i] = Math.round(r * na + px[i] * (1 - na));
  px[i + 1] = Math.round(g * na + px[i + 1] * (1 - na));
  px[i + 2] = Math.round(b * na + px[i + 2] * (1 - na));
  px[i + 3] = Math.min(255, Math.round(px[i + 3] + a));
}

// 圆角矩形 mask：x,y 是否在 (x0,y0,w,h,r) 圆角矩形内
function inRoundRect(x, y, x0, y0, w, h, r) {
  const cx = Math.max(x0 + r, Math.min(x, x0 + w - r));
  const cy = Math.max(y0 + r, Math.min(y, y0 + h - r));
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

// 背景：深蓝径向渐变 + 圆角矩形
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    if (!inRoundRect(x, y, 16, 16, SIZE - 32, SIZE - 32, 96)) continue;
    const nx = x / SIZE, ny = y / SIZE;
    const t = Math.min(1, Math.sqrt((nx - 0.5) ** 2 + (ny - 0.5) ** 2) * 1.8);
    const r = Math.round(30 + (18 - 30) * t);   // #1e2a4a → #121a30
    const g = Math.round(52 + (30 - 52) * t);
    const b = Math.round(110 + (58 - 110) * t);
    px[(y * SIZE + x) * 4] = r;
    px[(y * SIZE + x) * 4 + 1] = g;
    px[(y * SIZE + x) * 4 + 2] = b;
    px[(y * SIZE + x) * 4 + 3] = 255;
  }
}

// 中央“书页/轨道”抽象：三个白色圆点 + 一条弧线（MetaPilot 的“航向”意象）
const dots = [
  [138, 256, 52], [256, 256, 52], [374, 256, 52],
];
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    for (const [cx, cy, rad] of dots) {
      const d2 = (x - cx) ** 2 + (y - cy) ** 2;
      if (d2 <= rad * rad && d2 >= (rad - 26) ** 2) blend(x, y, 255, 255, 255, 235);
      if (d2 <= (rad - 30) ** 2) blend(x, y, 255, 255, 255, 96);
    }
    // 连接弧线（三点之间）
    const onArc = (x1, y1, x2, y2) => {
      const A = y2 - y1, B = x1 - x2, C = x2 * y1 - x1 * y2;
      const dist = Math.abs(A * x + B * y + C) / Math.hypot(A, B);
      const within = Math.min(x1, x2) - 4 <= x && x <= Math.max(x1, x2) + 4 && Math.min(y1, y2) - 4 <= y && y <= Math.max(y1, y2) + 4;
      return dist <= 8 && within;
    };
    if (onArc(138, 204, 256, 204) || onArc(256, 204, 374, 204) || onArc(138, 308, 256, 308) || onArc(256, 308, 374, 308)) {
      blend(x, y, 255, 255, 255, 200);
    }
  }
}

// ---- 编码 PNG ----
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([len, body, crcBuf]);
}

let crcTable = null;
function crc32(buf) {
  if (!crcTable) {
    crcTable = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// IHDR
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8;  // bit depth
ihdr[9] = 6;  // color type RGBA
// IDAT：每行前置 filter 0
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0;
  Buffer.from(px.buffer, y * SIZE * 4, SIZE * 4).copy(raw, y * (SIZE * 4 + 1) + 1);
}
const idat = deflateSync(raw);

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", idat),
  chunk("IEND", Buffer.alloc(0)),
]);

mkdirSync(join(root, "build"), { recursive: true });
const out = join(root, "build", "icon.png");
writeFileSync(out, png);
console.log(`icon written: ${out} (${png.length} bytes)`);