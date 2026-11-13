/** After a goal, like Nintendo World Cup: the picture cuts to the stand full of people, the big electric scoreboard with the two names and
 *  the score, the board of adverts in the colour of the team that scored and, in front of it on the grass, the scorer jumping with his
 *  arms up. A tap or any key goes on. */
export interface BoardInfo {
  home: string; away: string; score: [number, number];
  /** Who scored (0 the family), the colour of his team and what its advert says. */
  team: 0 | 1; color: string; ad: string;
  /** The scorer: his sheet, the size of a cell, how many cells a row has, and the cells of his celebration seen from the front. */
  hero?: { img: CanvasImageSource; cell: number; cols: number; start: number; frames: number; fps: number };
}

const W = 320, H = 180;
type C = CanvasRenderingContext2D;
const box = (c: C, col: string, x: number, y: number, w: number, h: number): void => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h); };
const up = (t: string): string => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

/** The digits of the scoreboard, 5 x 7 lamps each. */
const DIGITS: Record<string, string[]> = {
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'], '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'], '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'], '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'], '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'], '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
};
/** A number in lamps: lit ones in amber, the others dark, like a real board. */
function lamps(c: C, txt: string, cx: number, y: number, on: boolean): void {
  const s = 4, gw = 5 * s + 6, x0 = Math.round(cx - (txt.length * gw - 6) / 2);
  [...txt].forEach((ch, i) => (DIGITS[ch] ?? DIGITS['-']).forEach((row, r) => [...row].forEach((b, k) => {
    box(c, b === '1' && on ? '#ffb020' : '#2c2416', x0 + i * gw + k * s, y + r * s, s - 1, s - 1);
    if (b === '1' && on) box(c, '#ffe9a0', x0 + i * gw + k * s, y + r * s, 1, 1);
  })));
}

const SKIN = ['#f2c9a0', '#d9a070', '#a86a40', '#f7dcc0'], HAIR = ['#1a1230', '#5a3418', '#2a1b3d', '#8a5a20', '#d8c080'];
/** The stand: rows of little people in the colours of both teams, who jump all together (those of the team that scored, higher). */
function crowd(c: C, t: number, colors: [string, string], team: 0 | 1): void {
  box(c, '#3a1c12', 0, 0, W, 120);
  for (let r = 0; r < 12; r++) for (let i = -1; i < 33; i++) {
    const n = r * 37 + i * 11, fan = (n * 7 + r) % 5 < 3 ? team : (1 - team) as 0 | 1, x = i * 10 + (r % 2) * 5, y = 2 + r * 10;
    const jump = fan === team ? (Math.floor(t / 130 + (n % 3)) % 2) * 2 : 0;
    box(c, colors[fan], x + 1, y + 5 - jump, 8, 5);
    box(c, SKIN[n % 4], x + 2, y + 1 - jump, 6, 5); box(c, HAIR[n % 5], x + 2, y - jump, 6, 2);
    if (fan === team) { box(c, SKIN[n % 4], x, y + 1 - jump, 1, 4); box(c, SKIN[n % 4], x + 9, y + 1 - jump, 1, 4); }   // arms up
  }
}

function draw(c: C, v: BoardInfo, t: number, colors: [string, string]): void {
  crowd(c, t, colors, v.team);
  // the board: a dark panel in a grey frame, the two names and the score in lamps (the new goal blinks at first)
  box(c, '#000', 56, 12, 216, 92); box(c, '#9aa0b4', 54, 10, 216, 92); box(c, '#5a6078', 56, 12, 212, 88); box(c, '#14141c', 59, 15, 206, 82);
  c.font = '8px NES, monospace'; c.textBaseline = 'top'; c.textAlign = 'center';
  c.fillStyle = '#fff'; c.fillText(up(v.home).slice(0, 11), 110, 21); c.fillText(up(v.away).slice(0, 11), 214, 21);
  const blink = t < 900 && Math.floor(t / 110) % 2 === 0;
  lamps(c, String(v.score[0]), 110, 44, !(blink && v.team === 0)); lamps(c, '-', 162, 44, true); lamps(c, String(v.score[1]), 214, 44, !(blink && v.team === 1));
  for (let i = 0; i < 9; i++) box(c, Math.floor(t / 160 + i) % 3 ? '#3a3f55' : '#ffe45c', 78 + i * 20, 86, 8, 3);
  box(c, '#2a2f44', 150, 102, 24, 18);
  // the adverts in the colour of the team that scored, and the grass in front of them
  box(c, '#000', 0, 118, W, 2); box(c, v.color, 0, 120, W, 26); box(c, 'rgba(255,255,255,.18)', 0, 120, W, 3); box(c, 'rgba(0,0,0,.25)', 0, 143, W, 3);
  c.font = '16px NES, monospace'; c.fillStyle = 'rgba(0,0,0,.35)';
  const ad = up(v.ad), off = -((t / 40) % 200);
  for (let x = off; x < W + 200; x += 200) { c.fillStyle = 'rgba(0,0,0,.35)'; c.fillText(ad, x + 82, 127); c.fillStyle = '#fff'; c.fillText(ad, x + 80, 125); }
  box(c, '#2f9a3a', 0, 146, W, H - 146); box(c, '#5ddb43', 0, 146, W, 4); box(c, '#3fae4a', 0, 164, W, 6);
  // the scorer, jumping
  const h = v.hero;
  if (h) {
    const f = h.start + Math.floor((t / 1000) * h.fps) % h.frames, jump = Math.round(Math.abs(Math.sin(t / 150)) * 12), X = W / 2 - h.cell / 2, Y = H - h.cell - 2;
    c.globalAlpha = 0.3; box(c, '#000', W / 2 - 9 + jump / 4, H - 6, 18 - jump / 2, 3); c.globalAlpha = 1;
    c.drawImage(h.img, (f % h.cols) * h.cell, Math.floor(f / h.cols) * h.cell, h.cell, h.cell, X, Y - jump, h.cell, h.cell);
    // the lines of his shout
    if (Math.floor(t / 120) % 2 === 0) for (const [dx, dy, w, hh] of [[-15, 8, 5, 1], [-13, 2, 4, 1], [11, 8, 5, 1], [10, 2, 4, 1], [0, -3, 1, 5]]) box(c, '#fff', W / 2 + dx, Y - jump + dy, w, hh);
  }
  const fade = 1 - Math.min(1, t / 160);
  if (fade > 0) { c.globalAlpha = fade; box(c, '#000', 0, 0, W, H); c.globalAlpha = 1; }
}

/** Shows the scoreboard for `ms` and calls `done`. `colors`: the shirts of the family and of the rivals, for the people of the stand. */
export function showBoard(v: BoardInfo, colors: [string, string], done: () => void, ms = 2600): void {
  const ui = document.getElementById('ui')!;
  const el = document.createElement('div'); el.className = 'marcador'; el.id = 'marcador';
  el.innerHTML = `<canvas width="${W}" height="${H}"></canvas>`;
  ui.appendChild(el);
  const ctx = el.querySelector('canvas')!.getContext('2d')!; ctx.imageSmoothingEnabled = false;
  const t0 = performance.now();
  const tick = (): void => { if (!el.isConnected) return; draw(ctx, v, performance.now() - t0, colors); requestAnimationFrame(tick); };
  tick();
  let over = false;
  const end = (): void => { if (over) return; over = true; window.removeEventListener('keydown', key); el.remove(); done(); };
  const key = (): void => { if (performance.now() - t0 > 350) end(); };
  el.addEventListener('pointerdown', (e) => { e.stopPropagation(); key(); }); window.addEventListener('keydown', key);
  window.setTimeout(end, ms);
}
