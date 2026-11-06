/** Before the match, like Nintendo World Cup: first the map of the kingdoms with the little plane flying from the home of the family to the
 *  kingdom of the rival, then the two teams face each other with a big VS and the line that says how the rivals play. Tap or any key skips. */
export interface VsInfo {
  us: string; them: string; place: string; style: string; color: string; ours: string[]; theirs: string[]; avatar: (id: string, scale: number) => string;
  /** Which kingdom the plane flies to: bosque, arrecife, nubes or volcan. */
  kingdom?: string;
}

/** The map: islands on a 64 x 36 grid of 8 px cells (land colour, label, where the label goes). Home is the island of the family. */
const ISLANDS: Record<string, { x: number; y: number; w: number; h: number; c: string; d: string; name: string }> = {
  casa: { x: 6, y: 20, w: 9, h: 7, c: '#5ddb43', d: '#2f9a3a', name: 'CASA GG' },
  bosque: { x: 20, y: 6, w: 11, h: 8, c: '#3fae4a', d: '#1f6a2a', name: 'BOSQUE' },
  arrecife: { x: 24, y: 24, w: 10, h: 6, c: '#f0d890', d: '#c0a050', name: 'ARRECIFE' },
  nubes: { x: 40, y: 5, w: 10, h: 6, c: '#e8f4ff', d: '#a8c0e0', name: 'NUBE ALTA' },
  volcan: { x: 46, y: 20, w: 11, h: 9, c: '#8a4a3a', d: '#4a2020', name: 'VOLCAN' },
};

function drawMap(c: CanvasRenderingContext2D, to: string): void {
  c.fillStyle = '#10307a'; c.fillRect(0, 0, 512, 288);
  for (let y = 0; y < 36; y++) for (let x = 0; x < 64; x++) if ((x * 7 + y * 13) % 29 === 0) { c.fillStyle = '#2050a8'; c.fillRect(x * 8 + 2, y * 8 + 3, 4, 1); }   // waves
  for (const [id, i] of Object.entries(ISLANDS)) {
    for (let y = 0; y < i.h; y++) for (let x = 0; x < i.w; x++) {
      const e = Math.hypot((x + 0.5 - i.w / 2) / (i.w / 2), (y + 0.5 - i.h / 2) / (i.h / 2));
      if (e > 1 + ((x * 3 + y * 5) % 4) * 0.05) continue;
      c.fillStyle = e > 0.8 ? i.d : i.c; c.fillRect((i.x + x) * 8, (i.y + y) * 8, 8, 8);
    }
    if (id === 'volcan') { c.fillStyle = '#ff8a2a'; c.fillRect((i.x + 5) * 8, (i.y + 2) * 8, 8, 8); c.fillStyle = '#ffd447'; c.fillRect((i.x + 5) * 8 + 2, (i.y + 1) * 8 + 2, 4, 6); }
    c.fillStyle = id === to ? '#ffd447' : '#ffffff'; c.font = '8px NES, monospace'; c.textAlign = 'center';
    c.fillText(i.name, (i.x + i.w / 2) * 8, (i.y + i.h) * 8 + 12);
  }
}

/** The NES letters have no accented capitals: uppercase without accents. */
export const nesUp = (t: string): string => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();

export function showVs(v: VsInfo, done: () => void, ms = 4200): void {
  const ui = document.getElementById('ui')!;
  const to = v.kingdom && ISLANDS[v.kingdom] ? v.kingdom : 'volcan', a = ISLANDS.casa, b = ISLANDS[to];
  const el = document.createElement('div'); el.className = 'vs nesvs'; el.id = 'vs';
  const row = (ids: string[]): string => `<div class="vrow">${ids.map((id) => v.avatar(id, 1)).join('')}</div>`;
  el.innerHTML = `<div class="vmap"><canvas width="512" height="288"></canvas><i class="vplane"></i><b class="vdest">RUMBO A ${nesUp(v.place)}</b></div>
    <div class="vface"><div class="vside l"><b>${nesUp(v.us)}</b>${row(v.ours)}</div>
    <div class="vmid"><span>VS</span><em>${nesUp(v.place)}</em></div>
    <div class="vside r" style="--kc:${v.color}"><b>${nesUp(v.them)}</b>${row(v.theirs)}</div>
    <div class="vstyle">${nesUp(v.style)}</div></div><div class="vtap">PRESIONA START</div>`;
  ui.appendChild(el);
  const cv = el.querySelector('canvas')!, ctx = cv.getContext('2d')!; ctx.imageSmoothingEnabled = false;
  const draw = (): void => drawMap(ctx, to);
  draw(); (document as Document & { fonts?: FontFaceSet }).fonts?.ready.then(draw);
  // the plane flies from home to the kingdom along a gentle arc (percent of the map box)
  const plane = el.querySelector('.vplane') as HTMLElement, x0 = ((a.x + a.w / 2) / 64) * 100, y0 = ((a.y + a.h / 2) / 36) * 100, x1 = ((b.x + b.w / 2) / 64) * 100, y1 = ((b.y + b.h / 2) / 36) * 100;
  const t0 = performance.now(), fly = 1800;
  const tick = (): void => {
    const u = Math.min(1, (performance.now() - t0) / fly), k = u * u * (3 - 2 * u);
    plane.style.left = `${x0 + (x1 - x0) * k}%`; plane.style.top = `${y0 + (y1 - y0) * k - Math.sin(Math.PI * k) * 12}%`;
    plane.style.transform = `translate(-50%, -50%) scaleX(${x1 >= x0 ? 1 : -1})`;
    if (u < 1 && el.isConnected) requestAnimationFrame(tick); else el.classList.add('face');
  };
  requestAnimationFrame(tick);
  let over = false;
  const end = (): void => { if (over) return; over = true; window.removeEventListener('keydown', end); el.classList.add('out'); window.setTimeout(() => { el.remove(); done(); }, 220); };
  el.addEventListener('pointerdown', end); window.addEventListener('keydown', end);
  window.setTimeout(end, ms);
}
