/** The screen before the match, like the one of Nintendo World Cup: the two teams face each other with a big VS, a little plane crosses the sky
 *  towards the kingdom and the line below says how the rivals play. Tap (or any key) to skip it. */
export interface VsInfo { us: string; them: string; place: string; style: string; color: string; ours: string[]; theirs: string[]; avatar: (id: string, scale: number) => string }

const PLANE = `<svg class="plane" viewBox="0 0 32 14" shape-rendering="crispEdges"><path d="M2 6h18l6-5h3l-3 5h3v2h-3l3 5h-3l-6-5H2z" fill="#fff4de" stroke="#2a1b3d" stroke-width="1.5"/><path d="M9 6h2v2H9zM13 6h2v2h-2z" fill="#7be3ff"/></svg>`;

export function showVs(v: VsInfo, done: () => void, ms = 2600): void {
  const ui = document.getElementById('ui')!;
  const el = document.createElement('div'); el.className = 'vs'; el.id = 'vs';
  const row = (ids: string[]): string => `<div class="vrow">${ids.map((id) => v.avatar(id, 2)).join('')}</div>`;
  el.innerHTML = `<div class="vsky">${PLANE}</div>
    <div class="vside l"><b>${v.us}</b>${row(v.ours)}</div>
    <div class="vmid"><span>VS</span><em>${v.place}</em></div>
    <div class="vside r" style="--kc:${v.color}"><b>${v.them}</b>${row(v.theirs)}</div>
    <div class="vstyle">${v.style}</div><div class="vtap">toca para empezar</div>`;
  ui.appendChild(el);
  let over = false;
  const end = (): void => { if (over) return; over = true; window.removeEventListener('keydown', end); el.classList.add('out'); window.setTimeout(() => { el.remove(); done(); }, 220); };
  el.addEventListener('pointerdown', end); window.addEventListener('keydown', end);
  window.setTimeout(end, ms);
}
