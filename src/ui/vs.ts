import { asset } from '../asset';

/** Before the match, like Nintendo World Cup but with more punch: first the jumbo of the family flies to the kingdom through the clouds (it
 *  comes in fast, hangs a moment and shoots off), then the two crests come in from the sides and meet with a bang under a big VS, each on
 *  the rays of its colours with its flag waving. Under them the two squads and the line that says how the rivals play. Tap or any key skips. */
export interface VsInfo {
  us: string; them: string; place: string; style: string; color: string; ours: string[]; theirs: string[]; avatar: (id: string, scale: number) => string;
  /** Which kingdom the match is in: bosque, arrecife, nubes or volcan. */
  kingdom?: string;
  /** Plays a sound of the game by its name (the whoosh of the plane, the bang of the crests). */
  sfx?: (name: string) => void;
}

/** The colours of each kingdom on this screen: its side of the picture (light and dark rays) and its flag. */
const CREST: Record<string, { c: string; d: string; l: string }> = {
  bosque: { c: '#f07a1e', d: '#a04a10', l: '#f9a24e' },
  arrecife: { c: '#1f6fc4', d: '#123f7a', l: '#4f97e0' },
  nubes: { c: '#7a4fd0', d: '#4a2a8a', l: '#9a76e6' },
  volcan: { c: '#da251d', d: '#7a1410', l: '#e2554f' },
};
const FAMILY = { c: '#2a5bd7', d: '#132961', l: '#597fe0' };

const NAVY = '#2c4a94', W = 320, H = 176;
/** The trip of the plane lasts this long (ms); then the two crests meet. */
export const VS_TRIP = 1500;
type C = CanvasRenderingContext2D;
const box = (c: C, col: string, x: number, y: number, w: number, h: number): void => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h); };
const text = (c: C, t: string, x: number, y: number, col: string, size = 8): void => {
  c.font = `${size}px NES, monospace`; c.textAlign = 'center'; c.textBaseline = 'top';
  c.fillStyle = '#000'; c.fillText(t, Math.round(x) + 1, Math.round(y) + 1); c.fillStyle = col; c.fillText(t, Math.round(x), Math.round(y));
};
const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const outCubic = (u: number): number => 1 - (1 - clamp01(u)) ** 3;
const inCubic = (u: number): number => clamp01(u) ** 3;
const outBack = (u: number): number => { const k = clamp01(u) - 1; return 1 + 2.4 * k * k * k + 1.4 * k * k; };

/** The jumbo (tools/build_escudos.py), drawn `k` times its size and tilted: every column a little higher or lower than the one before. */
function plane(c: C, img: HTMLImageElement | null, x: number, y: number, tilt: number, k: number): void {
  if (!img) return;
  for (let sx = 0; sx < img.width; sx++) c.drawImage(img, sx, 0, 1, img.height, Math.round(x) + sx * k, Math.round(y) + Math.round((sx - img.width / 2) * tilt) * k, k, img.height * k);
}

/** A cloud of the NES: three white slabs with a shade under them. */
function cloud(c: C, x: number, y: number, w: number, far: boolean): void {
  const a = far ? '#6f8fd8' : '#ffffff', b = far ? '#5a7ac8' : '#c9d6f4', X = Math.round(x), Y = Math.round(y);
  box(c, b, X + 2, Y + 5, w - 4, 3); box(c, a, X, Y + 2, w, 4); box(c, a, X + 4, Y, Math.round(w * 0.45), 3); box(c, a, X + Math.round(w * 0.5), Y + 1, Math.round(w * 0.3), 2);
}

/** The first part: the jumbo of the family flies to the kingdom through the clouds. It comes in fast, hangs a moment and shoots off. */
function drawTrip(c: C, v: VsInfo, im: Art, t: number): void {
  // the sky: darker above, and the clouds rush past (the nearer, the faster)
  box(c, '#22387a', 0, 0, W, 54); box(c, NAVY, 0, 54, W, 70); box(c, '#3a5cb0', 0, 124, W, H - 124);
  const boost = 1 + 2.2 * inCubic((t - 1050) / 450);
  for (let i = 0; i < 9; i++) {
    const far = i % 3 === 0, sp = (far ? 0.05 : 0.12 + (i % 4) * 0.035) * boost, w = far ? 26 : 34 + (i % 3) * 10;
    const x = ((i * 83 - t * sp) % (W + 80) + (W + 80)) % (W + 80) - 60;
    cloud(c, x, 34 + ((i * 47) % 124), w, far);
  }
  text(c, 'COPA FAMILIA GG', W / 2, 6, '#fff');
  const where = `RUMBO A ${nesUp(v.place)}`;
  text(c, where.slice(0, Math.max(0, Math.floor((t - 150) / 28))), W / 2, 17, '#ffd447');
  // the plane: in from the left, a moment in the middle of the picture, and away to the right
  const pw = 120, enter = outCubic(t / 620), leave = inCubic((t - 1050) / 450);
  const x = -pw - 10 + enter * (W / 2 - pw / 2 + pw + 10) + leave * (W + 40), y = 70 + Math.sin(t / 150) * 2 - leave * 10;
  const tilt = -0.05 * (1 - enter) - 0.07 * leave + Math.sin(t / 240) * 0.012;
  // the lines of speed it leaves behind, longer when it shoots off
  for (let i = 0; i < 6; i++) { const ly = y + 14 + i * 5 + ((i * 7) % 3), len = (14 + ((i * 13) % 18)) * (0.6 + boost * 0.5); box(c, i % 2 ? '#ffffff' : '#bcd0ff', x - len - 4 - ((t / 6 + i * 11) % 14), ly, Math.round(len), 1); }
  plane(c, im.plane, x, y, tilt, 2);
  // the flash of the arrival
  const fl = clamp01((t - (VS_TRIP - 110)) / 110);
  if (fl > 0) { c.globalAlpha = fl; box(c, '#fff', 0, 0, W, H); c.globalAlpha = 1; }
}

/** The rays behind the two crests, like the versus of the fighting games: each side in its colours, turning slowly. Painted once per step of
 *  the turn and kept. */
function rays(kid: string, step: number): ImageData {
  const key = `${kid}_${step}`; let d = RAYS.get(key);
  if (d) return d;
  d = new ImageData(W, H);
  const k = CREST[kid] ?? CREST.volcan, hex = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const pal = [[hex(FAMILY.c), hex(FAMILY.l), hex(FAMILY.d)], [hex(k.c), hex(k.l), hex(k.d)]];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const split = W / 2 + (H / 2 - y) * 0.22, side = x < split ? 0 : 1, i = (y * W + x) * 4;
    let col: [number, number, number];
    if (Math.abs(x - split) < 1.5) col = [255, 255, 255];
    else {
      const dx = x - W / 2, dy = (y - 88) * 1.25, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx) / (Math.PI * 2) + 0.5;
      const band = Math.floor(a * 28 + step / 3) % 2 === 0;
      // a darker heart behind the VS, and a checker of the two tones where the rays fade into it (the dither of the NES)
      col = r < 34 ? pal[side][2] : r < 50 && (x + y) % 2 === 0 ? pal[side][2] : pal[side][band ? 1 : 0];
    }
    d.data[i] = col[0]; d.data[i + 1] = col[1]; d.data[i + 2] = col[2]; d.data[i + 3] = 255;
  }
  RAYS.set(key, d);
  return d;
}
const RAYS = new Map<string, ImageData>();

/** The second part: the two crests come in from the sides and meet with a bang, VS lands between them, the flags wave. */
function drawVs(c: C, v: VsInfo, kid: string, im: Art, t: number): void {
  c.putImageData(rays(kid, Math.floor(t / 110) % 6), 0, 0);
  // the shake of the bang
  const bang = t - 330, sh = bang >= 0 && bang < 260 ? Math.round(Math.sin(bang / 14) * 3 * (1 - bang / 260)) : 0;
  text(c, 'COPA FAMILIA GG', W / 2, 6, '#fff');
  text(c, nesUp(v.place), W / 2, 17, '#ffd447');
  const e = outBack(t / 360), bob = t > 500 ? Math.round(Math.sin(t / 260) * 1.5) : 0;
  // the crests, twice their size: they come in from the sides, overshoot a little and settle
  const lx = -100 + e * (100 + 22) + sh, rx = W + 4 - e * (W + 4 - 202) - sh, cy = 32;
  for (const [img, x, dy] of [[im.us, lx, bob], [im.them, rx, -bob]] as [HTMLImageElement | null, number, number][]) {
    if (!img) continue;
    c.globalAlpha = 0.4; c.drawImage(shadowOf(img), Math.round(x) + 6, cy + dy + 6, 96, 112); c.globalAlpha = 1;
    c.drawImage(img, Math.round(x), cy + dy, 96, 112);
  }
  if (t > 300) {
    // VS drops in big and settles
    const z = 1 + 1.6 * (1 - outCubic((t - 300) / 220)), size = Math.round(24 * z / 2) * 2;
    text(c, 'VS', W / 2 + 2, 88 - size / 2 + 2 + sh, '#1a1230', size); text(c, 'VS', W / 2, 88 - size / 2 + sh, '#ffe45c', size);
  }
  // little stars that twinkle round the crests
  if (t > 420) for (let i = 0; i < 6; i++) {
    const on = Math.floor(t / 140 + i * 1.7) % 4, sx = (i < 3 ? 12 : 196) + ((i * 37) % 110), sy = 30 + ((i * 53) % 120);
    if (on < 2) { box(c, '#fff', sx, sy - on, 1, 1 + on * 2); box(c, '#fff', sx - on, sy, 1 + on * 2, 1); }
  }
  const fl = 1 - clamp01((t - 330) / 160) - (t < 120 ? 0 : 0);
  const open = 1 - clamp01(t / 140);
  const a = Math.max(t >= 330 ? fl * 0.85 : 0, open);
  if (a > 0) { c.globalAlpha = a; box(c, '#fff', 0, 0, W, H); c.globalAlpha = 1; }
}

interface Art { plane: HTMLImageElement | null; us: HTMLImageElement | null; them: HTMLImageElement | null }

/** The shape of a picture in black, for its shadow (made once). */
const SHADOWS = new Map<HTMLImageElement, HTMLCanvasElement>();
function shadowOf(img: HTMLImageElement): HTMLCanvasElement {
  let s = SHADOWS.get(img);
  if (!s) {
    s = document.createElement('canvas'); s.width = img.width; s.height = img.height;
    const x = s.getContext('2d')!; x.drawImage(img, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = '#000'; x.fillRect(0, 0, s.width, s.height);
    SHADOWS.set(img, s);
  }
  return s;
}

/** The NES letters have no accented capitals: uppercase without accents. */
export const nesUp = (t: string): string => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

function draw(c: C, v: VsInfo, kid: string, im: Art, t: number): void {
  if (t < VS_TRIP) drawTrip(c, v, im, t); else drawVs(c, v, kid, im, t - VS_TRIP);
}

export function showVs(v: VsInfo, done: () => void, ms = 5600): void {
  const ui = document.getElementById('ui')!;
  const kid = v.kingdom && CREST[v.kingdom] ? v.kingdom : 'volcan';
  const el = document.createElement('div'); el.className = 'vs nesvs'; el.id = 'vs';
  const row = (ids: string[]): string => `<div class="vrow">${ids.map((id) => v.avatar(id, 1)).join('')}</div>`;
  el.innerHTML = `<canvas class="vcrest" width="${W}" height="${H}"></canvas>
    <div class="vteams"><div class="vside l"><b>${nesUp(v.us)}</b>${row(v.ours)}</div><div class="vside r"><b>${nesUp(v.them)}</b>${row(v.theirs)}</div></div>
    <div class="vstyle">${nesUp(v.style)}</div><div class="vtap">PRESIONA START</div>`;
  ui.appendChild(el);
  const cv = el.querySelector('canvas')!, ctx = cv.getContext('2d')!; ctx.imageSmoothingEnabled = false;
  // the pictures (tools/build_escudos.py); until one is in, it is just not drawn
  const im: Art = { plane: null, us: null, them: null };
  const load = (key: keyof Art, file: string): void => { const i = new Image(); i.onload = () => { im[key] = i; }; i.src = asset(`assets/ui/${file}.png`); };
  load('plane', 'avion'); load('us', 'escudo_familia'); load('them', `escudo_${kid}`);
  const t0 = performance.now(); let banged = false;
  v.sfx?.('whoosh');
  const tick = (): void => {
    if (!el.isConnected) return;
    const t = performance.now() - t0;
    draw(ctx, v, kid, im, t);
    if (!banged && t >= VS_TRIP + 330) { banged = true; v.sfx?.('pum'); v.sfx?.('whistle'); el.classList.add('met'); }
    requestAnimationFrame(tick);
  };
  tick();
  let over = false;
  const end = (): void => { if (over) return; over = true; window.removeEventListener('keydown', end); el.classList.add('out'); window.setTimeout(() => { el.remove(); done(); }, 220); };
  el.addEventListener('pointerdown', end); window.addEventListener('keydown', end);
  window.setTimeout(end, ms);
}
