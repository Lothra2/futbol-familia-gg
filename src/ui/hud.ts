import { T_ES } from '../data/text.es';
import type { Match } from '../core/state';

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
      <div class="banner" id="banner"></div><div class="hint" id="hint"></div><div class="flash" id="flash"></div>`;
    ui.appendChild(this.root);
    for (const id of ['n0', 'n1', 's0', 's1', 'clock', 'bar0', 'bar1', 'banner', 'hint', 'flash']) this.el[id] = this.root.querySelector('#' + id) as HTMLElement;
  }

  show(on: boolean): void { this.root.classList.toggle('hidden', !on); }
  /** While a cinematic plays the scoreboard and the bars step aside. */
  cinema(on: boolean): void { this.root.classList.toggle('cinema', on); }
  names(a: string, b: string): void { this.set('n0', a); this.set('n1', b); }
  private set(id: string, v: string): void { if (this.last[id] !== v) { this.last[id] = v; this.el[id].textContent = v; } }

  /** Cheap: only touches the DOM when a value changed. */
  update(m: Match): void {
    this.set('s0', String(m.score[0])); this.set('s1', String(m.score[1]));
    const left = m.phase === 'halftime' ? m.halfLength : m.halfLength - m.clock;
    this.set('clock', m.training ? 'Entrenamiento con Thor' : `${m.half === 1 ? T_ES.hud.half1 : T_ES.hud.half2}  ${mmss(left)}`);
    for (const t of [0, 1]) {
      const v = Math.round(m.bar[t]), el = this.el['bar' + t], key = `b${t}${v}`;
      if (this.last[key] === undefined) { this.last['bw' + t] = ''; this.last[key] = '1'; el.style.width = `${v}%`; el.parentElement!.classList.toggle('full', v >= 100); }
    }
  }

  banner(text: string, ms = 1400): void {
    if (!text) return;
    const b = this.el.banner; b.textContent = text; b.classList.add('show'); window.clearTimeout(this.bannerTimer);
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
