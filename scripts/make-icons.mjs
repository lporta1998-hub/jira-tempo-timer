/**
 * Generates the tray icons in electron/icons/ (no image tools needed).
 *   node scripts/make-icons.mjs
 *
 * A stopwatch in three states: idle (hand at 12), running (filled), paused (two bars).
 *  - macOS: black "...Template.png" images, which the menu bar recolors for light/dark mode.
 *  - Windows/Linux: colored images (gray / green / amber).
 * Each comes at 16px and @2x (32px). Windows also gets a multi-size .ico
 * (16–64px) so the tray icon stays sharp at 125% / 150% display scaling.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'electron', 'icons');

// ---- shapes, in a 16x16 coordinate space -----------------------------------
const C = { x: 8, y: 9.25 }; // dial center
const R = 5.6; // dial radius
const T = 1.5; // stroke width

const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return dist(px, py, ax + t * dx, ay + t * dy);
}
const inRect = (x, y, x0, y0, x1, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1;

const base = (x, y) =>
  Math.abs(dist(x, y, C.x, C.y) - R) <= T / 2 || // dial ring
  inRect(x, y, 6.25, 1.25, 9.75, 2.6) || // crown
  inRect(x, y, 7.3, 2.6, 8.7, 3.8); // stem

const SHAPES = {
  idle: (x, y) => base(x, y) || segDist(x, y, C.x, C.y, C.x, C.y - 3.2) <= 0.8 || dist(x, y, C.x, C.y) <= 1.1,
  running: (x, y) => base(x, y) || dist(x, y, C.x, C.y) <= 3.1,
  paused: (x, y) => base(x, y) || inRect(x, y, 5.9, 6.8, 7.3, 11.7) || inRect(x, y, 8.7, 6.8, 10.1, 11.7),
};

const COLORS = { idle: [148, 163, 184], running: [16, 185, 129], paused: [245, 158, 11] };

// ---- rasterize with 4x4 supersampling for smooth edges ---------------------
function render(shape, size, rgb) {
  const px = Buffer.alloc(size * size * 4);
  const s = 16 / size;
  const N = 4;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let hit = 0;
      for (let sy = 0; sy < N; sy++)
        for (let sx = 0; sx < N; sx++) if (shape((x + (sx + 0.5) / N) * s, (y + (sy + 0.5) / N) * s)) hit++;
      const i = (y * size + x) * 4;
      [px[i], px[i + 1], px[i + 2]] = rgb;
      px[i + 3] = Math.round((255 * hit) / (N * N));
    }
  }
  return encodePng(px, size);
}

// ---- minimal PNG encoder ----------------------------------------------------
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePng(rgba, size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** ICO container holding PNG-compressed images (supported since Windows Vista). */
function encodeIco(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(pngs.length, 4);
  const entries = [];
  let offset = 6 + 16 * pngs.length;
  for (const { size, data } of pngs) {
    const e = Buffer.alloc(16);
    e[0] = size >= 256 ? 0 : size; // width (0 means 256)
    e[1] = size >= 256 ? 0 : size; // height
    e[2] = 0; // palette colors
    e[3] = 0; // reserved
    e.writeUInt16LE(1, 4); // color planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    entries.push(e);
    offset += data.length;
  }
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]);
}

// ---- write ------------------------------------------------------------------
fs.mkdirSync(OUT, { recursive: true });
for (const [state, shape] of Object.entries(SHAPES)) {
  for (const [suffix, size] of [['', 16], ['@2x', 32]]) {
    fs.writeFileSync(path.join(OUT, `${state}Template${suffix}.png`), render(shape, size, [0, 0, 0]));
    fs.writeFileSync(path.join(OUT, `${state}${suffix}.png`), render(shape, size, COLORS[state]));
  }
  const icoSizes = [16, 20, 24, 32, 40, 48, 64];
  fs.writeFileSync(
    path.join(OUT, `${state}.ico`),
    encodeIco(icoSizes.map((size) => ({ size, data: render(shape, size, COLORS[state]) })))
  );
}
// A larger app icon for notifications / About.
fs.writeFileSync(path.join(OUT, 'app.png'), render(SHAPES.running, 256, COLORS.running));
console.log(`Icons written to ${OUT}`);
