/** Before the match, like Nintendo World Cup: on the navy blue screen the two crests face each other with a big VS, each with its flag under
 *  it, and the white jumbo crosses the screen taking the family to the kingdom. Under it the two squads and the line that says how the rivals
 *  play. Tap or any key skips. */
export interface VsInfo {
  us: string; them: string; place: string; style: string; color: string; ours: string[]; theirs: string[]; avatar: (id: string, scale: number) => string;
  /** Which kingdom the match is in: bosque, arrecife, nubes or volcan. */
  kingdom?: string;
}

/** The emblem on the crest of each kingdom: its word and the colour of the shield. */
const CREST: Record<string, { word: string; c: string; d: string }> = {
  bosque: { word: 'BOSQUE', c: '#ff8a2a', d: '#a04a10' },
  arrecife: { word: 'CORAL', c: '#2f5fa8', d: '#173870' },
  nubes: { word: 'NUBES', c: '#e8b83a', d: '#8a6410' },
  volcan: { word: 'DRAGON', c: '#e8423a', d: '#8a1a14' },
};

const NAVY = '#2c4a94', W = 288, H = 150;
type C = CanvasRenderingContext2D;
const box = (c: C, col: string, x: number, y: number, w: number, h: number): void => { c.fillStyle = col; c.fillRect(x, y, w, h); };
const text = (c: C, t: string, x: number, y: number, col: string, size = 8): void => {
  c.font = `${size}px NES, monospace`; c.textAlign = 'center'; c.textBaseline = 'top';
  c.fillStyle = '#000'; c.fillText(t, x + 1, y + 1); c.fillStyle = col; c.fillText(t, x, y);
};

/** The crest of the family: a white card with the flame of Nekketsu in the family colours and the word GG under it. */
function crestFamily(c: C, x: number, y: number): void {
  box(c, '#000', x + 4, y + 4, 52, 52); box(c, '#fff', x, y, 52, 52);
  // the flame: a tall teardrop with two smaller tongues at its sides, red outside, then orange, then a yellow heart
  const drop = (cx: number, top: number, h: number, r: number, cols: string[]): void => cols.forEach((col, k) => {
    // every inner colour is a smaller drop sitting on the bottom of the one around it
    const hk = h - k * 6, rk = r * (1 - k * 0.3), tk = top + k * 6 - k;
    for (let i = 0; i < hk; i++) {
      const u = i / hk, w = Math.round(u < 0.62 ? rk * Math.pow(u / 0.62, 0.75) : rk * Math.sqrt(Math.max(0, 1 - ((u - 0.62) / 0.38) ** 2)));
      if (w > 0) box(c, col, x + cx - w, y + tk + i, w * 2, 1);
    }
  });
  drop(15, 9, 16, 4, ['#e8423a', '#ff9a2a']);
  drop(37, 9, 16, 4, ['#e8423a', '#ff9a2a']);
  drop(26, 3, 30, 10, ['#e8423a', '#ff9a2a', '#ffe45c']);
  box(c, '#000', x + 6, y + 38, 40, 11);
  text(c, 'GG', x + 26, y + 40, '#5ddb43');
}

/** The crest of a kingdom: a shield in its colour with three stars on top and its word across, like the ITALY crest. */
function crestKingdom(c: C, x: number, y: number, k: { word: string; c: string; d: string }): void {
  box(c, '#000', x + 4, y + 4, 52, 52); box(c, '#fff', x, y, 52, 52);
  for (let i = 0; i < 36; i++) {
    const inset = i < 22 ? 0 : Math.round(((i - 22) / 14) ** 1.6 * 18);
    box(c, '#000', x + 7 + inset, y + 10 + i, 38 - inset * 2, 1);
    if (38 - inset * 2 > 4) box(c, i < 12 ? '#ffffff' : k.c, x + 9 + inset, y + 10 + i, 34 - inset * 2, 1);
  }
  box(c, k.d, x + 9, y + 22, 34, 1);
  for (const sx of [14, 24, 34]) { box(c, '#ffd447', x + sx, y + 4, 4, 2); box(c, '#ffd447', x + sx + 1, y + 3, 2, 4); }
  box(c, '#000', x + 1, y + 12, 50, 9);
  text(c, k.word, x + 26, y + 13, '#fff');
  // a football in the middle of the shield
  for (const [dy, dx0, w] of [[0, 3, 5], [1, 1, 9], [2, 0, 11], [3, 0, 11], [4, 0, 11], [5, 0, 11], [6, 0, 11], [7, 1, 9], [8, 3, 5]]) box(c, '#000', x + 20 + dx0, y + 27 + dy, w, 1);
  for (const [dy, dx0, w] of [[1, 3, 5], [2, 1, 9], [3, 1, 9], [4, 1, 9], [5, 1, 9], [6, 1, 9], [7, 3, 5]]) box(c, '#fff', x + 20 + dx0, y + 27 + dy, w, 1);
  box(c, '#000', x + 24, y + 30, 3, 3); box(c, '#000', x + 21, y + 29, 1, 2); box(c, '#000', x + 29, y + 29, 1, 2); box(c, '#000', x + 23, y + 34, 2, 1); box(c, '#000', x + 27, y + 34, 2, 1);
}

/** A little flag with its shadow: three bands. */
function flag(c: C, x: number, y: number, bands: string[]): void {
  box(c, '#000', x + 3, y + 3, 18, 12);
  bands.forEach((b, i) => box(c, b, x + i * 6, y, 6, 12));
}

/** The white jumbo of Nintendo World Cup, 34 x 14, with its orange stripe and windows. */
function plane(c: C, x: number, y: number): void {
  const X = Math.round(x), Y = Math.round(y);
  box(c, '#000', X + 1, Y + 7, 32, 5);            // outline under the body
  box(c, '#fff', X + 2, Y + 5, 28, 6);             // body
  box(c, '#fff', X + 30, Y + 6, 3, 4); box(c, '#fff', X + 33, Y + 7, 1, 2);   // nose
  box(c, '#fff', X + 1, Y, 4, 6); box(c, '#fff', X + 3, Y + 2, 3, 4);          // tail fin
  box(c, '#e8601a', X + 2, Y + 9, 30, 1); box(c, '#e8601a', X + 1, Y + 1, 2, 2);
  for (let i = 0; i < 8; i++) box(c, '#2c4a94', X + 9 + i * 2, Y + 7, 1, 1);  // windows
  box(c, '#2c4a94', X + 30, Y + 6, 2, 1);                                      // cockpit
  box(c, '#c8d0e0', X + 12, Y + 10, 10, 2); box(c, '#000', X + 13, Y + 12, 8, 1);   // wing
  box(c, '#888', X + 15, Y + 12, 3, 2);                                        // engine
}

/** The NES letters have no accented capitals: uppercase without accents. */
export const nesUp = (t: string): string => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

function draw(c: C, v: VsInfo, kid: string, t: number): void {
  box(c, NAVY, 0, 0, W, H);
  text(c, 'COPA FAMILIA GG', W / 2, 6, '#fff');
  text(c, nesUp(v.place), W / 2, 17, '#ffd447');
  crestFamily(c, 50, 32);
  crestKingdom(c, 186, 32, CREST[kid] ?? CREST.volcan);
  // VS in big white letters with a darker shadow
  text(c, 'VS', W / 2 + 2, 52, '#9ab0e0', 16); text(c, 'VS', W / 2, 50, '#fff', 16);
  flag(c, 66, 98, ['#5ddb43', '#ffffff', '#5ddb43']);
  const k = CREST[kid] ?? CREST.volcan;
  flag(c, 202, 98, [k.c, '#ffffff', k.c]);
  // the jumbo crosses from left to right and comes round again, bobbing a little
  const u = (t / 3200) % 1;
  plane(c, -40 + u * (W + 80), 122 + Math.sin(t / 260) * 1.5);
}

export function showVs(v: VsInfo, done: () => void, ms = 4200): void {
  const ui = document.getElementById('ui')!;
  const kid = v.kingdom && CREST[v.kingdom] ? v.kingdom : 'volcan';
  const el = document.createElement('div'); el.className = 'vs nesvs'; el.id = 'vs';
  const row = (ids: string[]): string => `<div class="vrow">${ids.map((id) => v.avatar(id, 1)).join('')}</div>`;
  el.innerHTML = `<canvas class="vcrest" width="${W}" height="${H}"></canvas>
    <div class="vteams"><div class="vside l"><b>${nesUp(v.us)}</b>${row(v.ours)}</div><div class="vside r"><b>${nesUp(v.them)}</b>${row(v.theirs)}</div></div>
    <div class="vstyle">${nesUp(v.style)}</div><div class="vtap">PRESIONA START</div>`;
  ui.appendChild(el);
  const cv = el.querySelector('canvas')!, ctx = cv.getContext('2d')!; ctx.imageSmoothingEnabled = false;
  const t0 = performance.now();
  const tick = (): void => { if (!el.isConnected) return; draw(ctx, v, kid, performance.now() - t0); requestAnimationFrame(tick); };
  tick();
  let over = false;
  const end = (): void => { if (over) return; over = true; window.removeEventListener('keydown', end); el.classList.add('out'); window.setTimeout(() => { el.remove(); done(); }, 220); };
  el.addEventListener('pointerdown', end); window.addEventListener('keydown', end);
  window.setTimeout(end, ms);
}
