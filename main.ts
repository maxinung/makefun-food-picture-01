import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { createDeflate, deflateSync } from 'zlib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const WIDTH = 1024;
const HEIGHT = 1024;
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR || '/output';
const OUTPUT_FILE = `${OUTPUT_DIR}/entry.png`;

mkdirSync(OUTPUT_DIR, { recursive: true });

// Simple seeded PRNG for determinism
let seed = 0xfeedc0de;
function rand() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 0xffffffff;
}
function randInt(min: number, max: number) {
  return Math.floor(rand() * (max - min + 1)) + min;
}

// Color helpers
function rgb(r: number, g: number, b: number) { return [r, g, b]; }
function lerpColor(c1: number[], c2: number[], t: number) {
  return [Math.round(c1[0] + (c2[0] - c1[0]) * t),
          Math.round(c1[1] + (c2[1] - c1[1]) * t),
          Math.round(c1[2] + (c2[2] - c1[2]) * t)];
}

// Canvas as flat Uint8Array (RGBA)
const canvas = new Uint8Array(WIDTH * HEIGHT * 4);
function setPixel(x: number, y: number, color: number[], a = 255) {
  if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) return;
  const i = (y * WIDTH + x) * 4;
  canvas[i] = color[0];
  canvas[i + 1] = color[1];
  canvas[i + 2] = color[2];
  canvas[i + 3] = a;
}
function getPixel(x: number, y: number) {
  if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) return [0, 0, 0, 0];
  const i = (y * WIDTH + x) * 4;
  return [canvas[i], canvas[i + 1], canvas[i + 2], canvas[i + 3]];
}

// Draw filled circle
function fillCircle(cx: number, cy: number, r: number, color: number[]) {
  const r2 = r * r;
  for (let dy = -r; dy <= r; dy++) {
    const dxMax = Math.floor(Math.sqrt(r2 - dy * dy));
    const y = cy + dy;
    for (let dx = -dxMax; dx <= dxMax; dx++) {
      setPixel(cx + dx, y, color);
    }
  }
}

// Draw filled ellipse
function fillEllipse(cx: number, cy: number, rx: number, ry: number, color: number[]) {
  const rx2 = rx * rx;
  const ry2 = ry * ry;
  for (let dy = -ry; dy <= ry; dy++) {
    const dxMax = Math.floor(rx * Math.sqrt(1 - (dy * dy) / ry2));
    const y = cy + dy;
    for (let dx = -dxMax; dx <= dxMax; dx++) {
      setPixel(cx + dx, y, color);
    }
  }
}

// Draw line with thickness
function drawLine(x1: number, y1: number, x2: number, y2: number, thickness: number, color: number[]) {
  const dx = Math.abs(x2 - x1);
  const dy = Math.abs(y2 - y1);
  const sx = x1 < x2 ? 1 : -1;
  const sy = y1 < y2 ? 1 : -1;
  let err = dx - dy;
  while (true) {
    for (let tx = -thickness; tx <= thickness; tx++) {
      for (let ty = -thickness; ty <= thickness; ty++) {
        if (tx * tx + ty * ty <= thickness * thickness) {
          setPixel(x1 + tx, y1 + ty, color);
        }
      }
    }
    if (x1 === x2 && y1 === y2) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x1 += sx; }
    if (e2 < dx) { err += dx; y1 += sy; }
  }
}

// Noise for texture
function noise(x: number, y: number) {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
}
function fbm(x: number, y: number, octaves = 4) {
  let value = 0;
  let amplitude = 1;
  let frequency = 1;
  let maxValue = 0;
  for (let i = 0; i < octaves; i++) {
    value += amplitude * noise(x * frequency, y * frequency);
    maxValue += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return value / maxValue;
}

// ============ START DRAWING ============

// 1. Dark wooden table background
const tableDark = rgb(60, 35, 20);
const tableLight = rgb(85, 50, 30);
for (let y = 0; y < HEIGHT; y++) {
  for (let x = 0; x < WIDTH; x++) {
    const n = fbm(x * 0.003, y * 0.003, 3);
    const t = 0.5 + 0.3 * n + 0.1 * Math.sin(y * 0.02);
    const color = lerpColor(tableDark, tableLight, t);
    setPixel(x, y, color);
  }
}

// Add wood grain lines
for (let i = 0; i < 40; i++) {
  const yBase = randInt(HEIGHT * 0.55, HEIGHT - 1);
  const color = rgb(
    randInt(45, 70),
    randInt(25, 40),
    randInt(15, 25)
  );
  for (let x = 0; x < WIDTH; x++) {
    const y = yBase + Math.sin(x * 0.01 + i) * 3 + randInt(-1, 1);
    if (y >= 0 && y < HEIGHT) setPixel(x, y, color);
  }
}

// 2. Bowl shadow on table
const bowlCenterX = WIDTH / 2;
const bowlCenterY = HEIGHT * 0.68;
const bowlOuterR = 280;
const bowlInnerR = 240;
for (let y = Math.floor(bowlCenterY + 20); y < HEIGHT; y++) {
  for (let x = 0; x < WIDTH; x++) {
    const dx = x - bowlCenterX;
    const dy = y - bowlCenterY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < bowlOuterR + 40) {
      const alpha = Math.max(0, 1 - (dist - bowlOuterR) / 40) * 60;
      const i = (y * WIDTH + x) * 4;
      canvas[i] = Math.max(0, canvas[i] - alpha);
      canvas[i + 1] = Math.max(0, canvas[i + 1] - alpha);
      canvas[i + 2] = Math.max(0, canvas[i + 2] - alpha);
    }
  }
}

// 3. Bowl exterior (ceramic, slightly off-white with subtle pattern)
const bowlOuterColor = rgb(245, 240, 235);
const bowlInnerColor = rgb(230, 225, 220);
fillEllipse(bowlCenterX, bowlCenterY + 30, bowlOuterR, bowlOuterR * 0.65, bowlOuterColor);

// Bowl interior (where broth goes)
fillEllipse(bowlCenterX, bowlCenterY + 30, bowlInnerR, bowlInnerR * 0.62, bowlInnerColor);

// Bowl rim highlight
for (let angle = 0; angle < Math.PI * 2; angle += 0.01) {
  const x = Math.cos(angle) * bowlOuterR + bowlCenterX;
  const y = Math.sin(angle) * bowlOuterR * 0.65 + bowlCenterY + 30;
  const nx = Math.cos(angle) * (bowlOuterR - 8) + bowlCenterX;
  const ny = Math.sin(angle) * (bowlOuterR - 8) * 0.65 + bowlCenterY + 30;
  drawLine(Math.round(x), Math.round(y), Math.round(nx), Math.round(ny), 1, rgb(255, 252, 248));
}

// 4. Broth (creamy tonkotsu - opaque white with subtle swirls)
const brothBase = rgb(250, 245, 235);
const brothShadow = rgb(235, 228, 215);
const brothHighlight = rgb(255, 252, 245);
const brothLevelY = bowlCenterY + 30 - bowlInnerR * 0.62 * 0.35; // fill to ~65%

for (let y = Math.ceil(brothLevelY); y < bowlCenterY + 30 + bowlInnerR * 0.62; y++) {
  for (let x = Math.ceil(bowlCenterX - bowlInnerR); x < bowlCenterX + bowlInnerR; x++) {
    const dx = x - bowlCenterX;
    const dy = y - (bowlCenterY + 30);
    const dist = Math.sqrt(dx * dx + (dy / 0.62) ** 2);
    if (dist < bowlInnerR) {
      // Subtle swirl pattern in broth
      const angle = Math.atan2(dy, dx);
      const swirl = Math.sin(dist * 0.03 - angle * 3) * 0.15;
      const depth = (y - brothLevelY) / (bowlCenterY + 30 + bowlInnerR * 0.62 - brothLevelY);
      const t = 0.3 + 0.4 * depth + swirl + fbm(x * 0.02, y * 0.02) * 0.1;
      const color = lerpColor(brothShadow, brothHighlight, Math.max(0, Math.min(1, t)));
      setPixel(x, y, color);
    }
  }
}

// 5. Noodles (wavy strands on top of broth)
const noodleColor = rgb(235, 225, 205);
const noodleShadow = rgb(210, 195, 170);
for (let strand = 0; strand < 45; strand++) {
  const startX = bowlCenterX + randInt(-bowlInnerR * 0.8, bowlInnerR * 0.8);
  const startY = brothLevelY + randInt(-8, 15);
  let x = startX;
  let y = startY;
  const waveFreq = 0.02 + rand() * 0.015;
  const waveAmp = 8 + rand() * 6;
  for (let i = 0; i < randInt(60, 120); i++) {
    x += 2 + rand() * 2;
    y += Math.sin(i * waveFreq) * waveAmp * 0.1 + (rand() - 0.5) * 1.5;
    if (x > bowlCenterX + bowlInnerR * 0.9) break;
    if (y > bowlCenterY + 30 + bowlInnerR * 0.62) break;
    const thickness = 2 + Math.floor(rand() * 2);
    const color = rand() > 0.5 ? noodleColor : noodleShadow;
    fillCircle(Math.round(x), Math.round(y), thickness, color);
  }
}

// 6. Chashu pork slices (3-4 slices)
const chashuBase = rgb(180, 80, 60);
const chashuFat = rgb(240, 220, 200);
const chashuDark = rgb(140, 50, 35);
for (let i = 0; i < 4; i++) {
  const angle = (i / 4) * Math.PI * 2 + 0.4;
  const r = bowlInnerR * 0.55;
  const cx = Math.cos(angle) * r + bowlCenterX;
  const cy = Math.sin(angle) * r * 0.62 + brothLevelY + 20;
  const sliceW = 70 + randInt(-5, 5);
  const sliceH = 22 + randInt(-3, 3);
  // Pork meat
  fillEllipse(cx, cy, sliceW, sliceH, chashuBase);
  // Fat marbling
  for (let m = 0; m < 6; m++) {
    const mx = cx + randInt(-sliceW * 0.7, sliceW * 0.7);
    const my = cy + randInt(-sliceH * 0.7, sliceH * 0.7);
    const mr = randInt(3, 8);
    fillCircle(mx, my, mr, chashuFat);
  }
  // Darker edge
  for (let angle2 = 0; angle2 < Math.PI * 2; angle2 += 0.1) {
    const ex = Math.cos(angle2) * sliceW + cx;
    const ey = Math.sin(angle2) * sliceH + cy;
    setPixel(Math.round(ex), Math.round(ey), chashuDark);
  }
}

// 7. Soft-boiled egg (halved, jammy yolk)
const eggWhite = rgb(255, 250, 240);
const eggYolk = rgb(255, 195, 60);
const eggYolkCenter = rgb(255, 170, 30);
const eggX = bowlCenterX + bowlInnerR * 0.3;
const eggY = brothLevelY - 10;
const eggR = 42;
// Egg white
fillCircle(eggX, eggY, eggR, eggWhite);
// Yolk (slightly runny center)
fillCircle(eggX, eggY, 22, eggYolk);
fillCircle(eggX, eggY, 14, eggYolkCenter);
// Highlight on yolk
fillCircle(eggX - 5, eggY - 5, 4, rgb(255, 220, 100));
// Egg white highlight
fillCircle(eggX - 10, eggY - 10, 6, rgb(255, 255, 250));

// 8. Green onions (negi)
const negiGreen = rgb(40, 160, 60);
const negiLight = rgb(80, 200, 90);
const negiDark = rgb(25, 120, 40);
for (let i = 0; i < 18; i++) {
  const angle = rand() * Math.PI * 2;
  const r = randInt(bowlInnerR * 0.3, bowlInnerR * 0.75);
  const x = Math.cos(angle) * r + bowlCenterX;
  const y = Math.sin(angle) * r * 0.62 + brothLevelY - 5;
  const len = randInt(25, 45);
  const w = 3 + randInt(0, 2);
  drawLine(x, y, x + randInt(-8, 8), y - len, w, negiGreen);
  drawLine(x, y, x + randInt(-8, 8), y - len, w - 1, negiLight);
}

// 9. Nori sheet (dark green/black, partially submerged)
const noriColor = rgb(15, 35, 20);
const noriHighlight = rgb(30, 60, 35);
const noriX = bowlCenterX - bowlInnerR * 0.55;
const noriY = brothLevelY - 15;
const noriW = 85;
const noriH = 110;
fillEllipse(noriX, noriY, noriW, noriH * 0.4, noriColor);
// Nori texture lines
for (let i = 0; i < 12; i++) {
  const ly = noriY - noriH * 0.4 + i * 8;
  drawLine(noriX - noriW * 0.8, ly, noriX + noriW * 0.8, ly, 1, noriHighlight);
}
// Nori submerged part (darker in broth)
fillEllipse(noriX, brothLevelY + 15, noriW * 0.9, 25, rgb(10, 25, 15));

// 10. Narutomaki (fish cake with pink swirl) - optional but nice
const narutoBase = rgb(255, 245, 240);
const narutoPink = rgb(255, 150, 150);
const narutoX = bowlCenterX - bowlInnerR * 0.3;
const narutoY = brothLevelY - 5;
const narutoR = 28;
fillCircle(narutoX, narutoY, narutoR, narutoBase);
// Pink swirl
for (let i = 0; i < 5; i++) {
  const angle = (i / 5) * Math.PI * 2;
  const r = 12;
  const cx = Math.cos(angle) * r + narutoX;
  const cy = Math.sin(angle) * r + narutoY;
  fillCircle(cx, cy, 6, narutoPink);
}
fillCircle(narutoX, narutoY, 5, narutoPink); // center

// 11. Steam rising (subtle, semi-transparent white)
for (let s = 0; s < 40; s++) {
  const sx = bowlCenterX + randInt(-60, 60);
  let sy = brothLevelY - randInt(5, 150);
  const steamW = randInt(8, 20);
  const steamH = randInt(30, 80);
  for (let i = 0; i < steamH; i++) {
    const alpha = Math.max(0, 40 - i * 0.5) * (0.7 + rand() * 0.3);
    const w = steamW * (1 - i / steamH * 0.5);
    for (let dx = -w; dx <= w; dx++) {
      const x = sx + dx + Math.sin(i * 0.1) * 5;
      const y = sy - i;
      if (y >= 0 && y < HEIGHT) {
        const idx = (y * WIDTH + Math.round(x)) * 4;
        if (idx >= 0 && idx < canvas.length - 3) {
          canvas[idx] = Math.min(255, canvas[idx] + alpha);
          canvas[idx + 1] = Math.min(255, canvas[idx + 1] + alpha);
          canvas[idx + 2] = Math.min(255, canvas[idx + 2] + alpha);
        }
      }
    }
  }
}

// 12. Bowl rim final highlight (top edge catch light)
for (let angle = 0; angle < Math.PI; angle += 0.005) {
  const x = Math.cos(angle) * (bowlOuterR - 4) + bowlCenterX;
  const y = Math.sin(angle) * (bowlOuterR - 4) * 0.65 + bowlCenterY + 30;
  setPixel(Math.round(x), Math.round(y), rgb(255, 254, 250));
}

// 13. Chopsticks (resting on bowl rim)
const chopstickColor = rgb(100, 60, 35);
const chopstickHighlight = rgb(140, 90, 50);
for (let c = 0; c < 2; c++) {
  const angle = -0.4 + c * 0.25;
  const x1 = Math.cos(angle) * (bowlOuterR + 120) + bowlCenterX;
  const y1 = Math.sin(angle) * (bowlOuterR + 120) * 0.65 + bowlCenterY + 30;
  const x2 = Math.cos(angle) * (bowlOuterR - 30) + bowlCenterX;
  const y2 = Math.sin(angle) * (bowlOuterR - 30) * 0.65 + bowlCenterY + 30;
  drawLine(Math.round(x1), Math.round(y1), Math.round(x2), Math.round(y2), 4, chopstickColor);
  drawLine(Math.round(x1), Math.round(y1), Math.round(x2), Math.round(y2), 1, chopstickHighlight);
}

// ============ PNG ENCODING ============

function writePNG(pixels: Uint8Array, width: number, height: number): Uint8Array {
  // PNG signature
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  
  // IHDR chunk
  const ihdrData = new Uint8Array(13);
  const dv = new DataView(ihdrData.buffer);
  dv.setUint32(0, width);
  dv.setUint32(4, height);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 2; // color type: truecolor (RGB)
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdr = createChunk('IHDR', ihdrData);
  
  // IDAT chunk - compress scanlines with filter type 0 (none)
  const scanlineSize = width * 3 + 1; // +1 for filter byte
  const rawData = new Uint8Array(scanlineSize * height);
  let idx = 0;
  for (let y = 0; y < height; y++) {
    rawData[idx++] = 0; // filter type 0
    for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 4;
      rawData[idx++] = pixels[p];     // R
      rawData[idx++] = pixels[p + 1]; // G
      rawData[idx++] = pixels[p + 2]; // B
    }
  }
  const compressed = deflateSync(rawData);
  const idat = createChunk('IDAT', compressed);
  
  // IEND chunk
  const iend = createChunk('IEND', new Uint8Array(0));
  
  // Combine all
  const totalLen = sig.length + ihdr.length + idat.length + iend.length;
  const out = new Uint8Array(totalLen);
  let off = 0;
  out.set(sig, off); off += sig.length;
  out.set(ihdr, off); off += ihdr.length;
  out.set(idat, off); off += idat.length;
  out.set(iend, off);
  return out;
}

function createChunk(type: string, data: Uint8Array): Uint8Array {
  const len = data.length;
  const typeBytes = new TextEncoder().encode(type);
  const chunk = new Uint8Array(4 + 1 + len + 4); // len + type + data + crc
  const dv = new DataView(chunk.buffer);
  dv.setUint32(0, len);
  chunk.set(typeBytes, 4);
  chunk.set(data, 5);
  // CRC32 of type + data
  const crcData = new Uint8Array(4 + len);
  crcData.set(typeBytes, 0);
  crcData.set(data, 4);
  const crc = crc32(crcData);
  dv.setUint32(5 + len, crc);
  return chunk;
}

// CRC32 implementation
const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[i] = c;
}
function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Generate and write PNG
const png = writePNG(canvas, WIDTH, HEIGHT);
writeFileSync(OUTPUT_FILE, png);
console.log(`Wrote ${OUTPUT_FILE} (${png.length} bytes, ${WIDTH}x${HEIGHT})`);