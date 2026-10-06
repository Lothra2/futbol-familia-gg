import type Phaser from 'phaser';
import type { SaveStore } from '../save/save';
import { LEVEL_XP, defaultSave } from '../save/save';
import type { MatchConfig } from '../app/controller';
import { FIELD_CHARS, type FieldChar } from '../core/teams';
import { KINGDOMS, kingdomOf, type Kingdom } from '../data/kingdoms';
import { cupInProgress, cupKingdom, startCup } from '../app/cup';
import { outfitsFor, PRIZES, xpToNext } from '../app/progress';
import { onFullscreenButton } from '../app/fullscreen';
import { BONUS_XP, ALL_BONUS_XP, dailyOf, rollDay } from '../app/daily';
import { bindGuide, defaultTab, guideHtml, type Tab } from './guide';
import { services } from '../app/services';
import type { TouchUI } from '../input/touch';
import type { CharId } from '../core/types';

type Name = 'title' | 'main' | 'quick' | 'cup' | 'vitrina' | 'settings' | 'training' | 'daily' | 'guide';
export interface ScreenDeps {
  game: Phaser.Game; store: SaveStore; touch: TouchUI;
  cfg: () => MatchConfig; setCfg: (c: MatchConfig) => void;
  play: (cfg: MatchConfig) => void;
  /** Starts the training session with Thor (M12). */
  train: (players: 1 | 2, drill: 'todo' | 'libre' | 'penal') => void;
  credits: () => void;
}

const NAMES: Record<string, string> = { papa: 'Papá', mama: 'Mamá', sophie: 'Sophie', alana: 'Alana', juandi: 'Juandi', thor: 'Thor' };
const ICON = {
  ball: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="#FFF7EC" stroke="#2A1B3D" stroke-width="2"/><path d="M12 7l3.5 2.6-1.3 4.2H9.8L8.5 9.6z" fill="#2A1B3D"/><path d="M12 7V3M15.5 9.6l4-1.4M14.2 13.8l2.4 3.4M9.8 13.8l-2.4 3.4M8.5 9.6l-4-1.4" stroke="#2A1B3D" stroke-width="1.6"/></svg>`,
  cup: `<svg viewBox="0 0 24 24"><path d="M7 3h10v6a5 5 0 0 1-10 0z" fill="#FFD447" stroke="#2A1B3D" stroke-width="2" stroke-linejoin="round"/><path d="M7 5H3c0 4 2 6 4 6M17 5h4c0 4-2 6-4 6" fill="none" stroke="#2A1B3D" stroke-width="2"/><path d="M12 14v4M8 21h8M9 18h6" stroke="#2A1B3D" stroke-width="2.4" stroke-linecap="round"/></svg>`,
  target: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="#fff" stroke="#2A1B3D" stroke-width="2"/><circle cx="12" cy="12" r="5.5" fill="#FF6FB5" stroke="#2A1B3D" stroke-width="2"/><circle cx="12" cy="12" r="2" fill="#2A1B3D"/></svg>`,
  medal: `<svg viewBox="0 0 24 24"><path d="M7 2l5 8 5-8" fill="#7BE3FF" stroke="#2A1B3D" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="15" r="6" fill="#FFD447" stroke="#2A1B3D" stroke-width="2"/><path d="M12 11.5l1.2 2.4 2.6.4-1.9 1.8.5 2.6-2.4-1.3-2.4 1.3.5-2.6-1.9-1.8 2.6-.4z" fill="#2A1B3D"/></svg>`,
  gear: `<svg viewBox="0 0 24 24"><path d="M12 2l2 3.2 3.7-.8.8 3.7L22 10l-2 3.2L22 16.4l-3.5 1.9-.8 3.7-3.7-.8L12 24l-2-3.2-3.7.8-.8-3.7L2 14l2-3.2L2 7.6l3.5-1.9.8-3.7 3.7.8z" transform="translate(0 -1) scale(.96)" fill="#B6B0C8" stroke="#2A1B3D" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="12" r="3.4" fill="#fff" stroke="#2A1B3D" stroke-width="2"/></svg>`,
  back: `<svg viewBox="0 0 24 24"><path d="M15 4l-8 8 8 8" stroke="#2A1B3D" stroke-width="3.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  lock: `<svg viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="11" rx="2" fill="#B6B0C8" stroke="#2A1B3D" stroke-width="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3" fill="none" stroke="#2A1B3D" stroke-width="2.4"/></svg>`,
  star: `<svg viewBox="0 0 24 24"><path d="M12 2l2.8 6.2 6.7.7-5 4.5 1.4 6.6L12 16.6 6.1 20l1.4-6.6-5-4.5 6.7-.7z" fill="#FFD447" stroke="#2A1B3D" stroke-width="2" stroke-linejoin="round"/></svg>`,
};

/** The screens of the game: title, main menu, quick match, Cup, showcase and settings. They sit over the live stadium of the Menu scene. */
export class Screens {
  private ui = document.getElementById('ui')!;
  private el: HTMLElement | null = null;
  private stack: Name[] = [];
  private cur: Name | null = null;
  private onKey = (e: KeyboardEvent): void => this.key(e);
  private gst: { tab: Tab; two: boolean; easy: boolean } = { tab: defaultTab(), two: false, easy: false };

  constructor(private d: ScreenDeps) { window.addEventListener('keydown', this.onKey); }

  get current(): Name | null { return this.cur; }
  close(): void { this.el?.remove(); this.el = null; this.cur = null; this.stack = []; }

  show(n: Name, push = true): void {
    if (push && this.cur && this.cur !== n && n !== 'main') this.stack.push(this.cur);
    if (n === 'main') this.stack = [];
    this.el?.remove();
    const el = document.createElement('div'); el.className = `screen menu2 m-${n}`; el.id = `s-${n}`;
    this.el = el; this.cur = n;
    el.innerHTML = this[n]();
    this.ui.appendChild(el);
    this.bind(n, el);
    (el.querySelector('[data-focus]') as HTMLElement | null)?.focus({ preventScroll: true });
    services.audio?.ui?.('tap');
  }
  back(): void { const p = this.stack.pop(); this.show(p ?? 'main', false); }

  // ------------------------------------------------------------------ helpers
  private av(id: string, scale = 2, extra = ''): string {
    if (scale === 2 && window.innerHeight < 520) scale = 1;
    const meta = this.d.game.cache.json.get(`${id}_meta`) as { anims: Record<string, { start: number }> } | undefined;
    const st = meta?.anims.idle?.start ?? 0, col = st % 8, row = Math.floor(st / 8), s = 48 * scale;
    return `<i class="av ${extra}" style="width:${s}px;height:${s}px;background-image:url(assets/sprites/${id}.png);background-size:${384 * scale}px auto;background-position:-${col * s}px -${row * s}px"></i>`;
  }
  avatar(id: string, scale: number): string { return this.av(id, scale); }
  private level(id: CharId): number { return this.d.store.data.characters[id].level; }
  private back_btn(): string { return `<button class="btn back" data-act="back" aria-label="Atrás">${ICON.back}</button>`; }
  private head(title: string, sub = ''): string { return `<div class="mhead">${this.back_btn()}<div><h2>${title}</h2>${sub ? `<small>${sub}</small>` : ''}</div></div>`; }
  private chips<T>(id: string, opts: { v: T; label: string }[], sel: T): string { return `<div class="chips" id="${id}">${opts.map((o, i) => `<button class="chip-o${o.v === sel ? ' sel' : ''}" data-i="${i}">${o.label}</button>`).join('')}</div>`; }

  // ------------------------------------------------------------------ screens
  private title(): string {
    const word = (w: string, cls: string): string => `<div class="${cls}">${[...w].map((c, i) => `<span style="animation-delay:${i * 0.09}s">${c === ' ' ? '&nbsp;' : c}</span>`).join('')}</div>`;
    return `<div class="logo">${word('FÚTBOL', 'l1')}${word('FAMILIA GG', 'l2')}<div class="ball-spin">${ICON.ball}</div></div>
      <div class="tap" data-focus tabindex="0">¡Toca para empezar!</div><div class="ver">Hecho con cariño para Sophie, Alana y Juandi</div>`;
  }

  private main(): string {
    const s = this.d.store.data, cupSub = cupInProgress(s) ? `Sigue: ${cupKingdom(s).name}` : s.trophies.copa > 0 ? `Campeones x${s.trophies.copa}` : '4 reinos, 1 gran copa';
    const b = (act: string, icon: string, label: string, sub: string, cls: string, focus = false): string => `<button class="mbtn ${cls}" data-act="${act}"${focus ? ' data-focus' : ''}><span class="ic">${icon}</span><span class="tx"><b>${label}</b><em>${sub}</em></span></button>`;
    const fam = (['sophie', 'alana', 'papa', 'mama', 'juandi', 'thor'] as CharId[]).map((c) => `<div class="fchip" title="${NAMES[c]}">${this.av(c, 1)}<b>Nv ${this.level(c)}</b></div>`).join('');
    return `<div class="side"><div class="mini-logo"><b>FÚTBOL</b><span>FAMILIA GG</span></div>
      ${b('quick', ICON.ball, 'Partido rápido', 'Elige rival y a jugar', 'green', true)}
      ${b('cup', ICON.cup, 'La Copa', cupSub, 'gold')}
      ${b('training', ICON.target, 'Entrenamiento', 'Practica con Thor', 'pink')}
      ${b('vitrina', ICON.medal, 'Vitrina', `${Object.values(s.trophies).slice(0, 4).filter(Boolean).length}/4 copas, trajes y récords`, 'blue')}
      ${b('settings', ICON.gear, 'Ajustes', 'Sonido, controles y más', 'gray')}</div>
      <div class="fam">${fam}</div>
      <div class="corner"><div class="cbtns"><button class="chip-o" data-act="guide">Cómo se juega</button><button class="chip-o" data-act="fs">Pantalla completa</button></div>${this.dailyCard()}</div>`;
  }

  /** The little card of the main menu: today's three challenges as dots. */
  private dailyCard(): string {
    const d = this.d.store.data; rollDay(d);
    const dots = d.daily.done.map((x) => `<i class="${x ? 'on' : ''}"></i>`).join('');
    return `<button class="dcard${d.daily.done.every(Boolean) ? ' all' : ''}" data-act="daily"><b>Desafíos del día</b><span class="dots">${dots}</span>${d.daily.streak > 0 ? `<em>Racha ${d.daily.streak}</em>` : '<em>+XP para todos</em>'}</button>`;
  }

  private guide(): string {
    return `${this.head('Cómo se juega', 'Teclado, pantalla táctil y trucos')}<div class="gwrap"><div class="qcol">${guideHtml(this.gst.tab, this.gst)}</div></div>
      <div class="mfoot"><button class="btn primary go" data-act="quick" data-focus>Jugar un partido</button></div>`;
  }

  private daily(): string {
    const s = this.d.store.data; rollDay(s);
    const defs = dailyOf(s.daily.date);
    const rows = defs.map((df, i) => {
      const have = s.daily.progress[i], pct = Math.round((have / df.need) * 100), done = s.daily.done[i];
      return `<div class="dr${done ? ' done' : ''}"><span class="ck">${done ? '★' : i + 1}</span><div class="dt"><b>${df.text}</b><div class="xp"><i style="width:${pct}%"></i></div></div><em>${have}/${df.need}</em></div>`;
    }).join('');
    return `${this.head('Desafíos del día', 'Cada día salen tres nuevos para toda la familia')}
      <div class="dwrap"><div class="qcol">${rows}
        <p class="note">Cada desafío da <b>+${BONUS_XP} XP a todos</b>. Cumple los tres y ganas <b>+${ALL_BONUS_XP} XP</b> más y sumas un día a tu racha. Cuentan los partidos rápidos y de la Copa.</p>
        <div class="streak">${s.daily.streak > 0 ? `Racha: <b>${s.daily.streak}</b> ${s.daily.streak === 1 ? 'día' : 'días'} seguidos` : 'Sin racha todavía. ¡Hoy puede empezar!'}</div></div></div>
      <div class="mfoot"><button class="btn primary go" data-act="quick" data-focus>Jugar un partido</button></div>`;
  }

  /** Squad cards: one character rests, tap to change. */
  private squadHtml(c: MatchConfig): string {
    const rester = FIELD_CHARS.find((f) => !c.squad.includes(f)) ?? 'juandi';
    return `<div class="cards" id="squad">${FIELD_CHARS.map((f, i) => `<button class="card${f === rester ? ' rest' : ' sel'}" data-i="${i}">${this.av(f, 2)}<b>${NAMES[f]}</b><em>${f === rester ? 'Descansa' : 'Nv ' + this.level(f)}</em></button>`).join('')}<div class="card thor">${this.av('thor', 2)}<b>Thor</b><em>Portero</em></div></div>`;
  }
  private kingdomCards(sel: string, trophies: Record<string, boolean | number>, lockFrom = -1): string {
    return `<div class="cards kcards" id="kingdoms">${KINGDOMS.map((k, i) => `<button class="card k${k.species === sel ? ' sel' : ''}${i > lockFrom && lockFrom >= 0 ? ' locked' : ''}" data-i="${i}" style="--kc:${k.color}">${this.av('riv_' + k.species, 2)}<b>${k.team}</b><em>${trophies[k.id] ? '★ ' : ''}${k.name}</em></button>`).join('')}</div>`;
  }

  private quick(): string {
    const c = this.d.cfg(), s = this.d.store.data;
    const ctl = [{ v: 'easy', label: 'Fáciles' }, { v: 'full', label: 'Completos' }];
    return `${this.head('Partido rápido', 'Arma tu equipo y elige a quién enfrentar')}
      <div class="qgrid"><div class="qcol"><div class="lbl">Tu equipo <small>toca para elegir quién descansa</small></div>${this.squadHtml(c)}
        <div class="lbl">Rival</div>${this.kingdomCards(c.rival, s.trophies)}</div>
      <div class="qcol opts">
        <div class="grp"><div class="lbl">Jugadores</div>${this.chips('players', [{ v: 1, label: '1 jugador' }, { v: 2, label: '2 juntos' }, { v: 3, label: '2 uno contra otro' }], c.players === 1 ? 1 : c.versus ? 3 : 2)}</div>
        <div class="grp"><div class="lbl">${c.players === 2 ? 'Controles J1' : 'Controles'}</div>${this.chips('c0', ctl, c.controls[0])}</div>
        ${c.players === 2 ? `<div class="grp"><div class="lbl">Controles J2</div>${this.chips('c1', ctl, c.controls[1])}</div>` : ''}
        <div class="grp"><div class="lbl">Dificultad</div>${this.chips('diff', [{ v: 'tranquilos', label: 'Tranquilos' }, { v: 'normales', label: 'Normales' }, { v: 'campeones', label: 'Campeones' }], c.difficulty)}</div>
        <div class="grp"><div class="lbl">Duración</div>${this.chips('half', [{ v: 60, label: '1:00' }, { v: 90, label: '1:30' }, { v: 120, label: '2:00' }], c.half)}</div>
        <div class="grp"><div class="lbl">Hora</div>${this.chips('time', [{ v: 'auto', label: 'Del reino' }, { v: 'day', label: 'Día' }, { v: 'sunset', label: 'Tarde' }, { v: 'night', label: 'Noche' }], c.time ?? 'auto')}</div>
      </div></div><div class="mfoot"><button class="btn primary go" data-act="play" data-focus>¡A jugar!</button></div>`;
  }

  private cup(): string {
    const s = this.d.store.data, prog = cupInProgress(s);
    const stage = s.cup.stage, diff = s.cup.difficulty;
    const stations = KINGDOMS.map((k, i) => {
      const done = s.trophies[k.id] && (prog ? i < stage : false), cur = prog && i === stage;
      return `<div class="st${done ? ' done' : ''}${cur ? ' cur' : ''}" style="--kc:${k.color}"><div class="num">${i + 1}</div>${this.av('riv_' + k.species, 2)}<b>${k.team}</b><em>${k.name}</em><div class="tr">${done ? ICON.cup : ICON.lock}</div></div>`;
    }).join('<div class="road"></div>');
    const k = cupKingdom(s);
    return `${this.head('La Copa', 'Gana en los cuatro reinos. Si empatan, gol de oro y penales')}
      <div class="path">${stations}</div>
      <div class="cupfoot">${prog ? `<div class="lbl">Siguiente: <b>${k.name}</b> contra ${k.team}</div><div class="lbl how">Cómo juegan: ${k.style}</div>` : s.trophies.copa > 0 ? `<div class="lbl">★ Campeones de la Copa x${s.trophies.copa}</div>` : `<div class="lbl">Elige la dificultad y arma tu equipo en Partido rápido</div>`}
      ${prog ? '' : `<div class="grp">${this.chips('cdiff', [{ v: 'tranquilos', label: 'Tranquilos' }, { v: 'normales', label: 'Normales' }, { v: 'campeones', label: 'Campeones' }], diff)}</div>`}
      <div class="row">${prog ? `<button class="btn primary" data-act="cupgo" data-focus>Continuar</button><button class="btn" data-act="cupnew">Nueva Copa</button>` : `<button class="btn primary" data-act="cupnew" data-focus>¡Empezar la Copa!</button>`}</div>
      <div class="lbl sq"><small>Equipo</small></div>${this.squadHtml(this.d.cfg())}</div>`;
  }

  private vitrina(): string {
    const s = this.d.store.data;
    const chars = (['sophie', 'alana', 'papa', 'mama', 'juandi', 'thor'] as CharId[]).map((c) => {
      const cs = s.characters[c], nx = xpToNext(cs.xp), pct = nx ? Math.round((nx.into / nx.need) * 100) : 100;
      const outs = outfitsFor(cs.level);
      const ob = c === 'thor' ? '' : (['base', 'arcoiris', 'estrellas'] as const).map((o) => `<button class="chip-o${cs.outfit === o ? ' sel' : ''}${outs.includes(o) ? '' : ' off'}" data-outfit="${c}:${o}" ${outs.includes(o) ? '' : 'disabled'}>${o === 'base' ? 'Normal' : o === 'arcoiris' ? 'Arcoíris' : 'Estrellas'}</button>`).join('');
      return `<div class="vc">${this.av(c, 2)}<div class="vt"><b>${NAMES[c]} <span class="lv">Nv ${cs.level}</span></b><div class="xp"><i style="width:${pct}%"></i></div><small>${nx ? `${cs.xp} XP, faltan ${nx.need - nx.into} para Nv ${nx.level + 1}` : `${cs.xp} XP, ¡nivel máximo!`}</small><div class="chips">${ob}</div></div></div>`;
    }).join('');
    const tro = KINGDOMS.map((k) => `<div class="tro${s.trophies[k.id] ? ' got' : ''}" style="--kc:${k.color}"><img class="tpx${s.trophies[k.id] ? '' : ' lk'}" src="assets/ui/trofeo_${k.id}.png" alt="">${s.trophies[k.id] ? '' : ICON.lock}<b>${k.trophy}</b></div>`).join('');
    const r = s.records;
    const prizes = Object.entries(PRIZES).map(([l, p]) => `<span>Nv ${l}: ${p}</span>`).join('');
    void LEVEL_XP;
    return `${this.head('Vitrina', 'Tus copas, trajes y récords')}
      <div class="vgrid"><div class="vleft">${chars}</div><div class="vright"><div class="lbl">Copas de los reinos</div><div class="tros">${tro}</div>
      <div class="bigcup"><img class="tpx big${s.trophies.copa > 0 ? '' : ' lk'}" src="assets/ui/trofeo_copa.png" alt=""><b>Gran Copa x${s.trophies.copa}</b></div>
      <div class="lbl">Récords</div><div class="recs"><div><b>${r.matches}</b>partidos</div><div><b>${r.goals}</b>goles</div><div><b>${r.specialGoals}</b>goles especiales</div><div><b>${r.thorSaves}</b>atajadas de Thor</div><div><b>${r.biggestWin}</b>mayor goleada</div></div>
      <div class="lbl">Premios por nivel</div><div class="prizes">${prizes}</div></div></div>`;
  }

  private settings(): string {
    const st = this.d.store.data.settings, pct = (v: number): number => Math.round(v * 100);
    const slider = (id: string, label: string, v: number): string => `<div class="grp"><div class="lbl">${label} <b id="${id}v">${pct(v)}%</b></div><input type="range" id="${id}" min="0" max="100" value="${pct(v)}"></div>`;
    return `${this.head('Ajustes')}<div class="sgrid"><div class="qcol">
      ${slider('music', 'Música', st.music)}${slider('sfx', 'Efectos', st.sfx)}${slider('crowd', 'Público', st.crowd)}
      <div class="grp"><div class="lbl">Sonido</div>${this.chips('muted', [{ v: false, label: 'Con sonido' }, { v: true, label: 'Silencio' }], st.muted)}</div></div>
      <div class="qcol"><div class="grp"><div class="lbl">Narrador</div>${this.chips('narr', [{ v: true, label: 'Con voz' }, { v: false, label: 'Sin voz' }], st.narrator)}</div>
      <div class="grp"><div class="lbl">Repetición del gol</div>${this.chips('replay', [{ v: true, label: 'Sí' }, { v: false, label: 'No' }], st.replay)}</div>
      <div class="grp"><div class="lbl">Cinemáticas</div>${this.chips('cine', [{ v: 'full', label: 'Completas' }, { v: 'short', label: 'Cortas' }, { v: 'off', label: 'Sin ellas' }], st.cinematics)}</div>
      <div class="grp"><div class="lbl">Botones en pantalla</div>${this.chips('touchmode', [{ v: 'auto', label: 'Automático' }, { v: 'on', label: 'Siempre' }, { v: 'off', label: 'Nunca' }], st.touchControls)}</div>
      <div class="grp"><div class="lbl">Qué tanto tapan los botones</div>${this.chips('look', [{ v: 'suave', label: 'Transparentes' }, { v: 'minimo', label: 'Casi invisibles' }, { v: 'normal', label: 'Sólidos' }], st.touchLook)}</div>
      <div class="grp"><div class="lbl">Jugador 2 en pantalla</div>${this.chips('mirror', [{ v: false, label: 'Normal' }, { v: true, label: 'Espejo' }], st.mirrorP2)}</div>
      <div class="grp"><div class="lbl">Ayuda</div><button class="chip-o" data-act="guide">Cómo se juega</button> <button class="chip-o" data-act="credits">Créditos</button></div><div class="grp"><div class="lbl">Tu progreso</div><button class="chip-o danger" data-act="wipe">Borrar todo</button></div></div></div>`;
  }

  private training(): string {
    return `${this.head('Entrenamiento', 'Practica pases, tiros y poderes con Thor')}
      <div class="qgrid"><div class="qcol"><div class="lbl">Jugadores</div>${this.chips('tplayers', [{ v: 1, label: '1 jugador' }, { v: 2, label: '2 juntos' }], this.d.cfg().players)}
      <div class="lbl">Tu equipo</div>${this.squadHtml(this.d.cfg())}</div>
      <div class="qcol opts"><div class="lbl">Qué practicar</div>${this.chips('tdrill', [{ v: 'todo', label: 'Todos los retos' }, { v: 'libre', label: 'Tiros libres' }, { v: 'penal', label: 'Penales' }], this.d.cfg().drill ?? 'todo')}
      <p class="note">${({ todo: 'Pases, tiros, el poder, un tiro libre y penales con Thor. Sin tiempo, sin presión.', libre: 'Tiros libres contra la barrera, uno tras otro. Mira con el stick y toca Tiro en ¡AHORA!', penal: 'Penales uno tras otro, vistos desde atrás del pateador. Mira con el stick y toca Tiro.' } as Record<string, string>)[this.d.cfg().drill ?? 'todo']}</p></div></div><div class="mfoot"><button class="btn primary go" data-act="trainGo" data-focus>¡A entrenar!</button></div>`;
  }

  // ------------------------------------------------------------------ behaviour
  private bind(n: Name, el: HTMLElement): void {
    const c = this.d.cfg(), store = this.d.store, set = (): void => this.d.setCfg(c);
    const redraw = (): void => this.show(n, false);
    const chips = (id: string, f: (i: number) => void): void => { el.querySelectorAll(`#${id} .chip-o`).forEach((b) => b.addEventListener('click', () => { f(Number((b as HTMLElement).dataset.i)); redraw(); })); };
    el.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
      if (n === 'title') { this.show('main'); return; }
      if (!t) return;
      const act = t.dataset.act!;
      switch (act) {
        case 'back': this.back(); break;
        case 'quick': case 'cup': case 'vitrina': case 'settings': case 'training': case 'daily': case 'guide': this.show(act as Name); break;
        case 'fs': void onFullscreenButton(); break;
        case 'credits': this.d.credits(); break;
        case 'play': services.audio?.unlock(); services.audio?.play('go'); this.d.play({ ...c, seed: (Date.now() & 0xffff) + 1, ff: 1, autoplay: null, cup: false, knockout: false, training: false, drill: undefined, arc: 0 }); break;
        case 'trainGo': this.d.train(c.players, c.drill ?? 'todo'); break;
        case 'cupnew': startCup(store.data, store.data.cup.difficulty); store.save(); this.cupMatch(); break;
        case 'cupgo': this.cupMatch(); break;
        case 'wipe': if (confirm('¿Borrar todo el progreso? No se puede deshacer.')) { Object.assign(store.data, defaultSave()); store.save(); redraw(); } break;
      }
    });
    if (n === 'guide') bindGuide(el, this.gst, () => this.show('guide', false));
    el.querySelectorAll('[data-outfit]').forEach((b) => b.addEventListener('click', () => { const [id, o] = (b as HTMLElement).dataset.outfit!.split(':'); store.data.characters[id as CharId].outfit = o as 'base'; store.save(); redraw(); }));
    chips('players', (i) => { c.players = i === 0 ? 1 : 2; c.versus = i === 2; set(); });
    chips('tplayers', (i) => { c.players = i === 0 ? 1 : 2; set(); });
    chips('tdrill', (i) => { c.drill = (['todo', 'libre', 'penal'] as const)[i]; set(); });
    chips('c0', (i) => { c.controls[0] = i === 0 ? 'easy' : 'full'; set(); this.persist(); });
    chips('c1', (i) => { c.controls[1] = i === 0 ? 'easy' : 'full'; set(); this.persist(); });
    chips('diff', (i) => { c.difficulty = (['tranquilos', 'normales', 'campeones'] as const)[i]; set(); this.persist(); });
    chips('cdiff', (i) => { store.data.cup.difficulty = (['tranquilos', 'normales', 'campeones'] as const)[i]; store.save(); });
    chips('half', (i) => { c.half = [60, 90, 120][i]; set(); this.persist(); });
    chips('time', (i) => { c.time = ([undefined, 'day', 'sunset', 'night'] as const)[i]; set(); });
    el.querySelectorAll('#squad .card[data-i]').forEach((b) => b.addEventListener('click', () => { const i = Number((b as HTMLElement).dataset.i); c.squad = FIELD_CHARS.filter((f) => f !== FIELD_CHARS[i]); set(); redraw(); }));
    el.querySelectorAll('#kingdoms .card[data-i]').forEach((b) => b.addEventListener('click', () => { const k = KINGDOMS[Number((b as HTMLElement).dataset.i)]; c.rival = k.species; c.stadium = k.stadium; set(); this.d.game.scene.getScene('Menu')?.scene.restart({ stadium: k.stadium, time: c.time }); redraw(); }));
    // settings
    const s = store.data.settings, apply = (): void => { services.audio?.setVolumes(s.music, s.sfx, s.muted, s.crowd); store.save(); };
    for (const [id, key] of [['music', 'music'], ['sfx', 'sfx'], ['crowd', 'crowd']] as const) {
      const r = el.querySelector(`#${id}`) as HTMLInputElement | null; if (!r) continue;
      r.addEventListener('input', () => { s[key] = Number(r.value) / 100; (el.querySelector(`#${id}v`) as HTMLElement).textContent = `${r.value}%`; apply(); });
    }
    chips('muted', (i) => { s.muted = i === 1; apply(); });
    chips('narr', (i) => { s.narrator = i === 0; c.narrator = s.narrator; set(); store.save(); });
    chips('replay', (i) => { s.replay = i === 0; c.replay = s.replay; set(); store.save(); });
    chips('cine', (i) => { s.cinematics = (['full', 'short', 'off'] as const)[i]; c.cine = s.cinematics; set(); store.save(); });
    chips('look', (i) => { s.touchLook = (['suave', 'minimo', 'normal'] as const)[i]; this.d.touch.setLook(s.touchLook); store.save(); });
    chips('touchmode', (i) => { s.touchControls = (['auto', 'on', 'off'] as const)[i]; this.d.touch.setMode(s.touchControls); store.save(); });
    chips('mirror', (i) => { s.mirrorP2 = i === 1; c.mirror = s.mirrorP2; set(); store.save(); });
  }

  /** Starts (or repeats) the match the Cup is waiting for. */
  cupMatch(): void {
    const c = this.d.cfg(), s = this.d.store.data, k: Kingdom = cupKingdom(s);
    services.audio?.unlock();
    this.d.play({ ...c, rival: k.species, stadium: k.stadium, time: undefined, difficulty: s.cup.difficulty, seed: (Date.now() & 0xffff) + 1, ff: 1, autoplay: null, cup: true, knockout: true, training: false, drill: undefined, versus: false, arc: Math.min(3, s.cup.stage) });
  }

  private persist(): void {
    const c = this.d.cfg(), s = this.d.store.data.settings;
    s.controls = [c.controls[0], c.controls[1]]; s.difficulty = c.difficulty; s.halfLength = c.half as 60 | 90 | 120; this.d.store.save();
  }

  /** Arrows move between the buttons, Enter presses, Escape goes back. */
  private key(e: KeyboardEvent): void {
    if (!this.el || !this.cur) return;
    const t = e.target as HTMLElement | null;
    if (t && t.tagName === 'INPUT' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) return;
    if (this.cur === 'title') { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.show('main'); } return; }
    if (e.key === 'Escape' || e.key === 'Backspace') { e.preventDefault(); if (this.cur !== 'main') this.back(); return; }
    const items = [...this.el.querySelectorAll<HTMLElement>('button:not([disabled]), input[type=range]')].filter((b) => b.offsetParent !== null);
    if (!items.length) return;
    const i = items.indexOf(document.activeElement as HTMLElement);
    const dir = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
    if (dir) { e.preventDefault(); items[(i + dir + items.length) % items.length]!.focus(); }
    else if ((e.key === 'Enter' || e.key === ' ') && document.activeElement && document.activeElement !== document.body && (document.activeElement as HTMLElement).tagName === 'BUTTON') { e.preventDefault(); (document.activeElement as HTMLElement).click(); }
  }
}
void kingdomOf;
