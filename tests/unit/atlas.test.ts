import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
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
const CELL = 48, BASE_ROWS = 7, FEET = 46;
const cellBytes = (a: { w: number; px: Uint8Array }, r: number, k: number): Uint8Array => {
  const out = new Uint8Array(CELL * CELL * 4);
  for (let y = 0; y < CELL; y++) out.set(a.px.subarray(((r * CELL + y) * a.w + k * CELL) * 4, ((r * CELL + y) * a.w + (k + 1) * CELL) * 4), y * CELL * 4);
  return out;
};
const sha = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex');

describe('atlas de la familia (B22)', () => {
  // Juandi has no Copa rows: his own atlas is checked below
  for (const id of ['sophie', 'alana', 'papa', 'mama', 'thor']) {
    const cur = readPng(`public/assets/sprites/${id}.png`), copa = readPng(`assets/sprites/${id}.png`);
    const meta = JSON.parse(readFileSync(`public/assets/sprites/${id}.json`, 'utf8'));
    const pal = new Set<string>((JSON.parse(readFileSync(`art-src/palette/${id}.json`, 'utf8')) as number[][]).map((c) => c.join(',')));
    it(`${id}: celdas de 48, 8 columnas y las filas 0 a 6 idénticas byte a byte a las de la Copa`, () => {
      expect(cur.w).toBe(8 * CELL);
      expect(cur.h % CELL).toBe(0);
      expect(cur.h / CELL).toBeGreaterThanOrEqual(BASE_ROWS);
      for (let r = 0; r < BASE_ROWS; r++) for (let k = 0; k < 8; k++) expect(sha(cellBytes(cur, r, k)), `${id} fila ${r} col ${k}`).toBe(sha(cellBytes(copa, r, k)));
    });
    it(`${id}: toda animación cae dentro del atlas y las filas nuevas tienen los pies en la fila ${FEET}, sin tocar el borde y con colores de la sub-paleta`, () => {
      const rows = cur.h / CELL;
      for (const [n, a] of Object.entries(meta.anims) as [string, { start: number; frames: number }][]) {
        expect(a.start + a.frames, n).toBeLessThanOrEqual(rows * 8);
        const r0 = Math.floor(a.start / 8);
        if (r0 < BASE_ROWS) continue;
        for (let f = 0; f < a.frames; f++) {
          const i = a.start + f, cell = cellBytes(cur, Math.floor(i / 8), i % 8);
          let low = -1, border = false;
          for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) {
            const o = (y * CELL + x) * 4;
            if (cell[o + 3] === 0) continue;
            low = Math.max(low, y);
            if (x === 0 || y === 0 || x === CELL - 1 || y === CELL - 1) border = true;
            expect(pal.has(`${cell[o]},${cell[o + 1]},${cell[o + 2]}`), `${id} ${n} cuadro ${f} color ${cell[o]},${cell[o + 1]},${cell[o + 2]}`).toBe(true);
          }
          expect(low, `${id} ${n} cuadro ${f} pies`).toBe(FEET);
          expect(border, `${id} ${n} cuadro ${f} borde`).toBe(false);
        }
      }
    });
  }

  it('juandi: su atlas propio tiene celdas de 48, anims dentro del atlas y pies en la fila 46 (el sustituto se salta la paleta)', () => {
    const cur = readPng('public/assets/sprites/juandi.png');
    const meta = JSON.parse(readFileSync('public/assets/sprites/juandi.json', 'utf8'));
    expect(cur.w).toBe(8 * CELL); expect(cur.h % CELL).toBe(0);
    const pal = meta.placeholder ? null : new Set<string>((JSON.parse(readFileSync('art-src/palette/juandi.json', 'utf8')) as number[][]).map((c) => c.join(',')));
    for (const [n, a] of Object.entries(meta.anims) as [string, { start: number; frames: number }][]) {
      expect(a.start + a.frames, n).toBeLessThanOrEqual((cur.h / CELL) * 8);
      for (let f = 0; f < a.frames; f++) {
        const i = a.start + f, cell = cellBytes(cur, Math.floor(i / 8), i % 8);
        let low = -1, border = false;
        for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) {
          const o = (y * CELL + x) * 4;
          if (cell[o + 3] === 0) continue;
          low = Math.max(low, y); if (x === 0 || y === 0 || x === CELL - 1 || y === CELL - 1) border = true;
          if (pal) expect(pal.has(`${cell[o]},${cell[o + 1]},${cell[o + 2]}`), `juandi ${n} color`).toBe(true);
        }
        if (n !== 'run') expect(low, `juandi ${n} ${f} pies`).toBe(FEET);
        expect(border, `juandi ${n} ${f} borde`).toBe(false);
      }
    }
  });

  for (const id of ['riv_dragon', 'riv_dragon_gk']) {
    it(`${id}: atlas propio de 4 filas con celdas de 48, anims dentro del atlas y sin tocar el borde (el portero cambia solo el color de la camiseta)`, () => {
      const cur = readPng(`public/assets/sprites/${id}.png`), meta = JSON.parse(readFileSync(`public/assets/sprites/${id}.json`, 'utf8'));
      expect(cur.w).toBe(8 * CELL); expect(cur.h).toBe(4 * CELL);
      const pal = id === 'riv_dragon' ? new Set<string>((JSON.parse(readFileSync('art-src/palette/riv_dragon.json', 'utf8')) as number[][]).map((c) => c.join(','))) : null;
      for (const need of ['run', 'idle', 'ready', 'pass', 'shot', 'slide', 'stagger', 'tumble', 'sad', 'gk_ready', 'gk_dive', 'celebrate']) expect(meta.anims[need], `${id} ${need}`).toBeDefined();
      for (const [n, a] of Object.entries(meta.anims) as [string, { start: number; frames: number }][]) {
        expect(a.start + a.frames, n).toBeLessThanOrEqual(32);
        for (let f = 0; f < a.frames; f++) {
          const i = a.start + f, cell = cellBytes(cur, Math.floor(i / 8), i % 8);
          let low = -1, border = false;
          for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) {
            const o = (y * CELL + x) * 4; if (cell[o + 3] === 0) continue;
            low = Math.max(low, y); if (x === 0 || y === 0 || x === CELL - 1 || y === CELL - 1) border = true;
            if (pal) expect(pal.has(`${cell[o]},${cell[o + 1]},${cell[o + 2]}`), `${id} ${n} color`).toBe(true);
          }
          expect(low, `${id} ${n} ${f} pies`).toBe(FEET); expect(border, `${id} ${n} ${f} borde`).toBe(false);
        }
      }
    });
  }
});
