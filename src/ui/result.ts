import type { Match } from '../core/state';
import type { MatchConfig } from '../app/controller';
import type { MatchResult } from '../app/progress';
import type { CupOutcome } from '../app/cup';
import type { DailyResult } from '../app/daily';
import { xpToNext } from '../app/progress';
import { LEVEL_XP, levelForXp } from '../save/save';
import { T_ES } from '../data/text.es';
import { kingdomOf } from '../data/kingdoms';
import type { CharId } from '../core/types';

const NAMES: Record<string, string> = { papa: 'Papá', mama: 'Mamá', sophie: 'Sophie', alana: 'Alana', juandi: 'Juandi', thor: 'Thor' };
const FACE_CHARS = ['sophie', 'alana', 'papa', 'mama', 'juandi', 'thor'];
const CUP = `<svg viewBox="0 0 24 24"><path d="M7 3h10v6a5 5 0 0 1-10 0z" fill="#FFD447" stroke="#2A1B3D" stroke-width="2" stroke-linejoin="round"/><path d="M7 5H3c0 4 2 6 4 6M17 5h4c0 4-2 6-4 6" fill="none" stroke="#2A1B3D" stroke-width="2"/><path d="M12 14v4M8 21h8M9 18h6" stroke="#2A1B3D" stroke-width="2.4" stroke-linecap="round"/></svg>`;

export interface ResultDeps {
  avatar: (id: string, scale: number) => string;
  xpOf: (id: CharId) => number;
  onAgain: () => void; onMenu: () => void;
  /** Starts the next match of the Cup (or repeats the one that was lost). */
  onNext?: () => void;
  onCredits: () => void;
}

/** The screen after a match: score, who was best, the XP each of the family won and the level they reached, and the Cup. */
export function showResult(m: Match, cfg: MatchConfig, res: MatchResult | null, cup: CupOutcome | null, d: ResultDeps, daily: DailyResult | null = null): HTMLElement {
  const [a, b] = m.score, pw = m.penWinner;
  const won = a > b || (a === b && pw === 0), draw = a === b && pw === null;
  const rival = kingdomOf(cfg.rival as 'dragon');
  const fam = m.players.filter((p) => p.team === 0 && p.role !== 'gk').sort((p, q) => q.stats2.goals * 3 + q.stats2.assists - (p.stats2.goals * 3 + p.stats2.assists))[0];
  const pens = pw !== null && m.pen ? `Penales ${m.pen.kicks[0].filter((k) => k === 1).length} - ${m.pen.kicks[1].filter((k) => k === 1).length}` : m.golden && a !== b ? 'Gol de oro' : '';
  let head = T_ES.result.title, msg = won ? T_ES.result.win : draw ? T_ES.result.draw : T_ES.result.lose;
  if (cfg.versus) { head = '¡Fin del partido!'; msg = won ? '¡Ganó la Familia GG!' : draw ? '¡Empate! Qué partidazo entre los dos' : `¡Ganaron los ${T_ES.teams[cfg.rival] ?? 'rivales'}!`; }
  if (cup) {
    if (cup.kind === 'champion') { head = '¡CAMPEONES DE LA COPA!'; msg = '¡Ganaron los cuatro reinos!'; }
    else if (cup.kind === 'advance') { head = `¡${rival.trophy}!`; msg = `¡Ganaron en ${rival.name}!`; }
    else { head = 'Casi...'; msg = 'No pasa nada, ¡a intentarlo otra vez!'; }
  }
  const tiles = res ? res.chars.map((c) => {
    const xpNow = d.xpOf(c.id), before = Math.max(0, xpNow - c.xp), lvBefore = levelForXp(before);
    const nx = xpToNext(xpNow), pct = nx ? Math.round((nx.into / nx.need) * 100) : 100, pctBefore = lvBefore === c.level ? (xpToNext(before) ? Math.round((xpToNext(before)!.into / xpToNext(before)!.need) * 100) : 100) : 0;
    const up = c.levelUps.length ? `<div class="up">¡Nivel ${c.level}!<small>${c.levelUps.map((u) => u.prize).join(', ')}</small></div>` : '';
    return `<div class="xt${c.levelUps.length ? ' lvup' : ''}">${d.avatar(c.id, 1)}<div class="xi"><b>${NAMES[c.id]}</b><span>Nv ${c.level}</span><div class="xp"><i data-to="${pct}" style="width:${pctBefore}%"></i></div><em>+${c.xp} XP</em>${up}</div></div>`;
  }).join('') : '';
  const dl = daily && daily.xp > 0 ? `<div class="dbox">★ ${daily.newlyDone.map((t) => `<b>${t}</b>`).join(' · ')} <span>+${daily.xp} XP para todos</span>${daily.all ? `<span>¡Los tres de hoy! Racha: ${daily.streak}</span>` : ''}${daily.levelUps.length ? `<small>${[...new Map(daily.levelUps.map((u) => [u.id + u.level, u])).values()].map((u) => `${NAMES[u.id]} Nv ${u.level}: ${u.prize}`).join(' · ')}</small>` : ''}</div>` : '';
  const recs = res && res.newRecords.length ? `<div class="rec">${res.newRecords.map((r) => `★ ${r}`).join(' · ')}</div>` : '';
  const champion = cup?.kind === 'champion';
  const next = cup?.kind === 'advance' && cup.next ? `Siguiente: ${cup.next.name}` : cup?.kind === 'rematch' ? 'Revancha' : '';
  const box = document.createElement('div');
  box.className = `screen dim result2${champion ? ' champion' : ''}`; box.id = 'result';
  box.innerHTML = `<div class="panel rpanel">${champion ? `<div class="bigtrophy"><img class="tpx" src="assets/ui/trofeo_copa.png" alt="" onerror="this.outerHTML=this.dataset.fb" data-fb='${CUP}'></div><div class="confetti">${Array.from({ length: 28 }, (_, i) => `<i style="left:${(i * 37) % 100}%;animation-delay:${(i % 9) * 0.25}s;background:${['#ff5e7e', '#ffb23f', '#ffe45c', '#5ddb43', '#4cc9e8', '#b98cff'][i % 6]}"></i>`).join('')}</div>` : ''}
    ${cup?.kind === 'advance' && cup.trophy ? `<div class="bigtrophy small"><img class="tpx" src="assets/ui/trofeo_${cup.trophy}.png" alt=""></div>` : ''}
    <h2>${head}</h2>
    <div class="big-score"><span>${T_ES.teams.family}</span><b>${a} : ${b}</b><span>${T_ES.teams[cfg.rival] ?? ''}</span></div>
    ${pens ? `<div class="pens">${pens}</div>` : ''}
    <p class="msg">${msg}</p>
    ${fam && fam.stats2.goals > 0 ? `<p class="mvp">${fam.charId && FACE_CHARS.includes(fam.charId) ? `<i class="faceb" style="background-image:url(assets/cine/caras_${fam.charId}.png);background-position:${won ? -240 : draw ? 0 : -160}px 0"></i>` : ''}<span>${T_ES.result.mvp}: <b>${fam.name}</b> · ${T_ES.result.goals(fam.stats2.goals)}</span></p>` : ''}
    ${recs}
    ${dl}
    ${tiles ? `<div class="xgrid">${tiles}</div>` : ''}
    <div class="row">${cup && cup.kind !== 'champion' ? `<button class="btn big primary" id="next" data-focus>${next}</button>` : champion ? `<button class="btn big primary" id="credits" data-focus>Ver créditos</button>` : `<button class="btn big primary" id="again" data-focus>${T_ES.result.again}</button>`}<button class="btn big" id="tomenu">${T_ES.result.menu}</button></div></div>`;
  if (won && !draw) {      // the victory poster of the best of the family stands next to the panel (only where there is room, see .rposter in ui.css)
    const who = (fam?.charId ?? res?.chars[0]?.id ?? 'sophie') as string;
    const poster = document.createElement('img');
    poster.className = 'rposter'; poster.alt = ''; poster.src = `assets/cine/win_${who}.png`; poster.onerror = () => poster.remove();
    box.appendChild(poster);
  }
  box.querySelector('#again')?.addEventListener('click', d.onAgain);
  box.querySelector('#next')?.addEventListener('click', () => (d.onNext ?? d.onAgain)());
  box.querySelector('#credits')?.addEventListener('click', d.onCredits);
  box.querySelector('#tomenu')!.addEventListener('click', d.onMenu);
  document.getElementById('ui')!.appendChild(box);
  // the XP bars fill after the screen appears
  requestAnimationFrame(() => requestAnimationFrame(() => box.querySelectorAll<HTMLElement>('.xp i').forEach((i) => { i.style.width = `${i.dataset.to}%`; })));
  void LEVEL_XP;
  return box;
}

export const CREDITS = [
  ['Fútbol Familia GG', ''],
  ['Idea y dirección', 'Rick (Ricardo Gutiérrez)'],
  ['Estrellas', 'Sophie, Alana, Juandi, Papá, Mamá y Thor'],
  ['Programación y diseño', 'Claude (Anthropic), con Rick'],
  ['Arte pixel', 'Generado con Higgsfield (xai/grok-imagine) y procesado a 16 bits en código'],
  ['Motor', 'Phaser 4'],
  ['Letra', 'Pixelify Sans (licencia OFL)'],
  ['Música y sonidos', 'Sintetizados en el navegador, sin muestras externas'],
  ['Gracias por jugar', '¡Ahora la revancha!'],
] as const;

export function showCredits(onClose: () => void): HTMLElement {
  const box = document.createElement('div');
  box.className = 'screen dim credits'; box.id = 'credits-screen';
  box.innerHTML = `<div class="roll"><div class="rin">${CREDITS.map(([h, t]) => `<div class="cr"><b>${h}</b>${t ? `<span>${t}</span>` : ''}</div>`).join('')}</div></div><button class="btn" id="cclose" data-focus>Cerrar</button>`;
  box.querySelector('#cclose')!.addEventListener('click', () => { box.remove(); onClose(); });
  document.getElementById('ui')!.appendChild(box);
  return box;
}
