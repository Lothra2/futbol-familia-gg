import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

/** Minimal PNG reader for 8-bit RGBA without interlacing (what the sprite builders write). */
function readPng(path: string): { w: number; h: number; px: Uint8Array } {
  const d = readFileSync(path);
  const w = d.readUInt32BE(16), h = d.readUInt32BE(20);
  if (d[24] !== 8 || d[25] !== 6 || d[28] !== 0) throw new Error(`${path}: expected 8-bit RGBA, no interlace`);
  const parts: Buffer[] = [];
  for (let o = 8; o < d.length;) { const n = d.readUInt32BE(o), t = d.toString('latin1', o + 4, o + 8); if (t === 'IDAT') parts.push(d.subarray(o + 8, o + 8 + n)); o += 12 + n; }
  const raw = inflateSync(Buffer.concat(parts)), bpp = 4, stride = w * bpp, out = new Uint8Array(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride;
    for (let i = 0; i < stride; i++) {
      const x = raw[src + i], a = i >= bpp ? out[dst + i - bpp] : 0, b = y ? out[dst - stride + i] : 0, c = i >= bpp && y ? out[dst - stride + i - bpp] : 0;
      let v = x;
      if (f === 1) v = x + a; else if (f === 2) v = x + b; else if (f === 3) v = x + ((a + b) >> 1);
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); }
      out[dst + i] = v & 255;
    }
  }
  return { w, h, px: out };
}

const CELL = 48;
/** The six running frames of a character must show real motion: no two of them can be nearly the same drawing (silhouette IoU after aligning the feet and the centre). */
function iou(a: { w: number; px: Uint8Array }, i: number, j: number): number {
  const sil = (k: number): { m: Uint8Array; yb: number; xc: number } => {
    const r = Math.floor(k / 8), c = k % 8, m = new Uint8Array(CELL * CELL); let yb = 0, sx = 0, n = 0;
    for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) if (a.px[(((r * CELL + y) * a.w) + c * CELL + x) * 4 + 3] > 0) { m[y * CELL + x] = 1; yb = Math.max(yb, y); sx += x; n++; }
    return { m, yb, xc: Math.round(sx / Math.max(1, n)) };
  };
  const A = sil(i), B = sil(j); let inter = 0, uni = 0;
  const dy = A.yb - B.yb, dx = A.xc - B.xc;
  for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) {
    const a1 = A.m[y * CELL + x], yy = y - dy, xx = x - dx, b1 = yy >= 0 && yy < CELL && xx >= 0 && xx < CELL ? B.m[yy * CELL + xx] : 0;
    if (a1 && b1) inter++; if (a1 || b1) uni++;
  }
  return inter / Math.max(1, uni);
}
const CASES: [string, number, number][] = [['sophie', 80, 0.93], ['alana', 80, 0.93], ['papa', 80, 0.93], ['mama', 80, 0.93], ['juandi', 0, 0.93], ['riv_dragon', 0, 0.93], ['riv_tiburon', 0, 0.93], ['riv_buho', 0, 0.97], ['riv_mapache', 0, 0.97]];
describe('la carrera se ve como carrera', () => {
  for (const [name, start, limit] of CASES) {
    it(`${name}: las 6 poses de correr son distintas entre si y la animacion las recorre todas`, () => {
      const a = readPng(`public/assets/sprites/${name}.png`), meta = JSON.parse(readFileSync(`public/assets/sprites/${name}.json`, 'utf8'));
      expect(meta.anims.run.start).toBe(start); expect(meta.anims.run.frames).toBe(6); expect(meta.anims.run.fps).toBeGreaterThanOrEqual(11);
      let worst = 0;
      for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) worst = Math.max(worst, iou(a, start + i, start + j));
      expect(worst, `${name}: dos cuadros de la carrera casi iguales (IoU ${worst.toFixed(2)})`).toBeLessThanOrEqual(limit);
    });
  }
});
