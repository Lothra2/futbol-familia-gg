import { T_ES } from '../data/text.es';
import type { Match, Player } from '../core/state';
import { PITCH } from '../core/field';

/** The player of a team nearest to the ball (not the keeper unless he has it). */
const near = (m: Match, t: 0 | 1): Player | undefined => m.players.filter((p) => p.team === t && (p.role !== 'gk' || m.ball.owner === p.id)).sort((a, b) => Math.hypot(a.x - m.ball.x, a.y - m.ball.y) - Math.hypot(b.x - m.ball.x, b.y - m.ball.y))[0];
const mmss = (s: number): string => { const t = Math.max(0, Math.ceil(s)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };

/** Score, clock, Barra Estrella, banners and the result panel. DOM over the canvas, so the text is sharp at any size. */
export class Hud {
  private root: HTMLElement;
  private el: Record<string, HTMLElement> = {};
  private last: Record<string, string> = {};
  private bannerTimer = 0;
  private hintTimer = 0;
  private flashTimer = 0;

  constructor() {
    const ui = document.getElementById('ui')!;
    this.root = document.createElement('div'); this.root.id = 'hud'; this.root.className = 'hidden';
    this.root.innerHTML = `
      <div class="sb"><div class="team t0"><b id="n0"></b></div><div class="score"><span id="s0">0</span><em>:</em><span id="s1">0</span></div><div class="team t1"><b id="n1"></b></div></div>
      <div class="clock" id="clock"></div>
      <div class="star left"><i id="bar0"></i><span>★</span></div><div class="star right"><i id="bar1"></i><span>★</span></div>
      <div class="banner" id="banner"></div><div class="hint" id="hint"></div><div class="flash" id="flash"></div>
      <div class="nes" id="nes"><div class="nb l"><i id="nlc"></i><b id="nln"></b><em id="nlp"></em></div><div class="nb c"><canvas id="mini" width="120" height="50"></canvas><b id="nclock"></b></div><div class="nb r"><i id="nrc"></i><b id="nrn"></b><em id="nrp"></em></div></div>`;
    ui.appendChild(this.root);
    for (const id of ['n0', 'n1', 's0', 's1', 'clock', 'bar0', 'bar1', 'banner', 'hint', 'flash', 'nes', 'nln', 'nlp', 'nlc', 'nrn', 'nrp', 'nrc', 'nclock']) this.el[id] = this.root.querySelector('#' + id) as HTMLElement;
  }

  show(on: boolean): void { this.root.classList.toggle('hidden', !on); }
  /** While a cinematic plays the scoreboard and the bars step aside. */
  cinema(on: boolean): void { this.root.classList.toggle('cinema', on); }
  names(a: string, b: string): void { this.set('n0', a); this.set('n1', b); }
  private set(id: string, v: string): void { if (this.last[id] !== v) { this.last[id] = v; this.el[id].textContent = v; } }

  /** Canvas pixels the bottom bar covers (0 when it sits at the top, on touch screens where the buttons live at the bottom). */
  bottomInset(canvasH: number): number {
    const n = this.el.nes; if (!n || this.root.classList.contains('hidden') || getComputedStyle(n).position !== 'absolute' || n.offsetTop < window.innerHeight / 2) return 0;
    return Math.round((n.offsetHeight * canvasH) / Math.max(1, window.innerHeight));
  }
  private miniT = 0;
  /** The bar of Nintendo World Cup: who you move and his place, the rival nearest to the ball, the minimap with every player and the clock. */
  private nes(m: Match): void {
    const me = m.players.find((p) => m.humans[0] && p.id === m.humans[0].id) ?? near(m, 0), them = near(m, 1);
    const pos = (p: Player | undefined): string => (p ? T_ES.hud.pos[p.role] : '');
    this.set('nln', me?.name ?? ''); this.set('nlp', pos(me)); this.set('nrn', them?.name ?? ''); this.set('nrp', pos(them));
    if (++this.miniT % 2) return;
    const c = (this.root.querySelector('#mini') as HTMLCanvasElement).getContext('2d')!, W = 120, H = 50, k = W / PITCH.w, ky = H / PITCH.d;
    c.fillStyle = '#2f7a3a'; c.fillRect(0, 0, W, H);
    c.fillStyle = 'rgba(255,255,255,.55)'; c.fillRect(W / 2, 0, 1, H); c.strokeStyle = 'rgba(255,255,255,.55)'; c.strokeRect(0.5, 0.5, W - 1, H - 1);
    c.fillRect(0, H / 2 - 6, 2, 12); c.fillRect(W - 2, H / 2 - 6, 2, 12);
    for (const p of m.players) {
      const human = p.control === 'human';
      c.fillStyle = human ? '#7be3ff' : p.team === 0 ? '#ffe45c' : '#ff5e7e';
      const s = human ? 4 : 3; c.fillRect(Math.round(p.x * k - s / 2), Math.round(p.y * ky - s / 2), s, s);
    }
    c.fillStyle = '#ffffff'; c.fillRect(Math.round(m.ball.x * k - 1), Math.round(m.ball.y * ky - 1), 2, 2);
  }

  /** Cheap: only touches the DOM when a value changed. */
  update(m: Match): void {
    this.nes(m);
    this.set('s0', String(m.score[0])); this.set('s1', String(m.score[1]));
    const left = m.phase === 'halftime' ? m.halfLength : m.halfLength - m.clock;
    this.set('clock', m.training ? 'Entrenamiento con Thor' : `${m.half === 1 ? T_ES.hud.half1 : T_ES.hud.half2}  ${mmss(left)}`);
    this.set('nclock', m.training ? '' : mmss(left));
    for (const t of [0, 1]) {
      const v = Math.round(m.bar[t]), el = this.el['bar' + t], key = `b${t}${v}`;
      if (this.last[key] === undefined) { this.last['bw' + t] = ''; this.last[key] = '1'; el.style.width = `${v}%`; el.parentElement!.classList.toggle('full', v >= 100); }
    }
  }

  banner(text: string, ms = 1400): void {
    if (!text) return;
    // the NES letters have no accented capitals
    const b = this.el.banner; b.textContent = text.toUpperCase().replace(/[ÁÉÍÓÚÜ]/g, (c) => 'AEIOUU'['ÁÉÍÓÚÜ'.indexOf(c)]);
    b.classList.add('show'); window.clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => b.classList.remove('show'), ms);
  }
  hint(text: string, ms = 1200): void {
    const h = this.el.hint; h.textContent = text; h.classList.add('show'); window.clearTimeout(this.hintTimer);
    this.hintTimer = window.setTimeout(() => h.classList.remove('show'), ms);
  }
  flash(ms = 250): void {
    const f = this.el.flash; f.classList.add('on'); window.clearTimeout(this.flashTimer);
    this.flashTimer = window.setTimeout(() => f.classList.remove('on'), ms);
  }

  /** The end of the match: the result, the best player of the family and the two buttons. */
  result(m: Match, onAgain: () => void, onMenu: () => void): HTMLElement {
    const [a, b] = m.score;
    const msg = a > b ? T_ES.result.win : a === b ? T_ES.result.draw : T_ES.result.lose;
    const fam = m.players.filter((p) => p.team === 0 && p.role !== 'gk').sort((p, q) => q.stats2.goals * 3 + q.stats2.assists - (p.stats2.goals * 3 + p.stats2.assists))[0];
    const box = document.createElement('div');
    box.className = 'screen dim'; box.id = 'result';
    box.innerHTML = `<div class="panel"><h2>${T_ES.result.title}</h2>
      <div class="big-score"><span>${this.last.n0 ?? ''}</span><b>${a} : ${b}</b><span>${this.last.n1 ?? ''}</span></div>
      <p class="msg">${msg}</p>
      ${fam && fam.stats2.goals > 0 ? `<p>${T_ES.result.mvp}: <b>${fam.name}</b> · ${T_ES.result.goals(fam.stats2.goals)}</p>` : ''}
      <div class="row"><button class="btn big primary" id="again">${T_ES.result.again}</button><button class="btn big" id="tomenu">${T_ES.result.menu}</button></div></div>`;
    box.querySelector('#again')!.addEventListener('click', onAgain);
    box.querySelector('#tomenu')!.addEventListener('click', onMenu);
    document.getElementById('ui')!.appendChild(box);
    return box;
  }
}
