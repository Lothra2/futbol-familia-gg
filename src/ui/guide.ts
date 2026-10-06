import { ICONS } from './icons';

/** The guide of controls: one screen with keyboard, touch and tips, and a short first-match tour. Pure HTML builders, so the menu, the pause menu and the tour show the same pictures. */
export type Tab = 'teclado' | 'tactil' | 'trucos';
export type Focus = 'move' | 'shoot' | 'pass' | 'special' | 'sprint' | null;

const COL = { move: '#7be3ff', shoot: '#ff7a7a', pass: '#7be36a', sprint: '#ffd447', special: '#c79bff', neutral: '#e6dcf5' } as const;

/** Phones and tablets with a touch screen start on the touch tab, everything else on the keyboard. */
export const defaultTab = (): Tab => (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches ? 'tactil' : 'teclado');

const cap = (label: string, kind: keyof typeof COL, what: string, focus: Focus, mine: Focus, wide = false): string =>
  `<div class="kc${wide ? ' wide' : ''}${focus && focus !== mine ? ' faded' : ''}"><div class="kcap" style="--kc:${COL[kind]}">${label}</div>${what ? `<small>${what}</small>` : ''}</div>`;

/** One keyboard: the move keys and the four action keys. `p2` draws the keys of the second player. */
function board(who: 'solo' | 'p1' | 'p2', focus: Focus): string {
  const mv = who === 'p2' ? ['↑', '←', '↓', '→'] : ['W', 'A', 'S', 'D'];
  const act = who === 'solo' ? [['J', 'Tiro', 'shoot'], ['K', 'Pase', 'pass'], ['L', 'Correr', 'sprint'], ['I', 'Especial', 'special']]
    : who === 'p1' ? [['F', 'Tiro', 'shoot'], ['G', 'Pase', 'pass'], ['H', 'Correr', 'sprint'], ['T', 'Especial', 'special']]
      : [[',', 'Tiro', 'shoot'], ['.', 'Pase', 'pass'], ['/', 'Correr', 'sprint'], [';', 'Especial', 'special']];
  const f = (k: Focus): string => (focus && focus !== k ? ' faded' : '');
  return `<div class="board">
    <div class="bm${f('move')}"><div class="pad">
      <i></i><div class="kcap" style="--kc:${COL.move}">${mv[0]}</div><i></i>
      <div class="kcap" style="--kc:${COL.move}">${mv[1]}</div><div class="kcap" style="--kc:${COL.move}">${mv[2]}</div><div class="kcap" style="--kc:${COL.move}">${mv[3]}</div>
    </div><small>Moverte</small>${who === 'solo' ? '<em>o las flechas</em>' : ''}</div>
    <div class="ba">${act.map(([k, t, ft]) => cap(k, ft as keyof typeof COL, t, focus, ft as Focus)).join('')}</div>
  </div>`;
}

export function keyboardHtml(two: boolean, focus: Focus = null): string {
  if (!two) {
    return `<div class="boards one">${board('solo', focus)}</div>
      <div class="extras"><span><b class="kcap sm" style="--kc:${COL.shoot}">Espacio</b> también es Tiro</span><span><b class="kcap sm" style="--kc:${COL.sprint}">Shift</b> también es Correr</span><span><b class="kcap sm" style="--kc:${COL.special}">Enter</b> también es Especial</span><span><b class="kcap sm" style="--kc:${COL.neutral}">Esc</b> o <b class="kcap sm" style="--kc:${COL.neutral}">P</b> pausa</span></div>`;
  }
  return `<div class="boards two"><div><h4>Jugador 1</h4>${board('p1', focus)}</div><div><h4>Jugador 2</h4>${board('p2', focus)}</div></div>
    <div class="extras"><span>Los dos juegan en el mismo teclado. <b class="kcap sm" style="--kc:${COL.neutral}">Esc</b> pausa.</span></div>`;
}

/** The touch screen as a phone held sideways: the stick on the left, the buttons on the right, each with a label. */
export function touchHtml(easy: boolean, focus: Focus = null): string {
  const fd = (k: Focus): string => (focus && focus !== k ? 'faded' : '');
  const btn = (cx: number, cy: number, r: number, color: string, icon: string, label: string, k: Focus, side: 'l' | 'r' | 't' | 'b'): string => {
    const lx = side === 'l' ? cx - r - 6 : side === 'r' ? cx + r + 6 : cx, ly = side === 't' ? cy - r - 6 : side === 'b' ? cy + r + 15 : cy + 4, anchor = side === 'l' ? 'end' : side === 'r' ? 'start' : 'middle';
    return `<g class="tb ${fd(k)}"><circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff4de" stroke="#2a1b3d" stroke-width="3"/><svg x="${cx - r * 0.55}" y="${cy - r * 0.55}" width="${r * 1.1}" height="${r * 1.1}" viewBox="0 0 24 24">${icon}</svg>
      <text x="${lx}" y="${ly}" text-anchor="${anchor}" fill="${color}" class="lb">${label}</text></g>`;
  };
  const inner = (k: Btn): string => ICONS[k].replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
  return `<svg class="phone" viewBox="0 0 420 200" role="img" aria-label="Pantalla táctil: joystick a la izquierda y botones a la derecha">
    <rect x="8" y="8" width="404" height="184" rx="26" fill="#1f1433" stroke="#4b3768" stroke-width="5"/>
    <rect x="22" y="22" width="376" height="156" rx="14" fill="#2f8a4a"/><rect x="22" y="22" width="376" height="156" rx="14" fill="none" stroke="#ffffff55" stroke-width="2"/>
    <line x1="210" y1="22" x2="210" y2="178" stroke="#ffffff44" stroke-width="2"/><circle cx="210" cy="100" r="22" fill="none" stroke="#ffffff44" stroke-width="2"/>
    <g class="tb ${fd('move')}"><circle cx="86" cy="118" r="38" fill="#2a1b3d66" stroke="#fff" stroke-width="3"/><circle cx="86" cy="118" r="17" fill="${COL.move}" stroke="#2a1b3d" stroke-width="3"/>
      <path d="M86 70l-7 9h14zM86 166l-7-9h14zM38 118l9-7v14zM134 118l-9-7v14z" fill="#fff"/><text x="86" y="60" text-anchor="middle" fill="${COL.move}" class="lb">Mueve con el pulgar</text></g>
    ${easy
      ? `${btn(342, 112, 31, COL.shoot, inner('kick'), '¡Patea!', 'shoot', 'b')}${btn(342, 48, 21, COL.special, inner('special'), 'Especial', 'special', 'b')}`
      : `${btn(352, 118, 28, COL.shoot, inner('shoot'), 'Tiro', 'shoot', 'b')}${btn(300, 140, 22, COL.pass, inner('pass'), 'Pase', 'pass', 'l')}${btn(352, 52, 20, COL.special, inner('special'), 'Especial', 'special', 'b')}${btn(272, 62, 18, COL.sprint, inner('sprint'), 'Correr', 'sprint', 'b')}`}
  </svg>`;
}
type Btn = keyof typeof ICONS & ('shoot' | 'pass' | 'sprint' | 'special' | 'kick');

const TIPS: [string, string, string][] = [
  ['Pase alto', 'Toca <b>Pase</b> para un pase raso. <b>Mantenlo</b> un momento y suéltalo: el balón vuela por arriba y pasa a los rivales.', 'pass'],
  ['Más potencia', 'Mantén <b>Tiro</b> y suéltalo cuando la barra se llene. Si te pasas, dispara solo.', 'shoot'],
  ['Tu poder', 'Pases, robos y paredes llenan la barra <b>★</b>. Con la barra llena y cerca del arco, toca <b>Especial</b>. En la película, toca <b>Tiro</b> cuando el anillo se cierre: más puntería, más gol.', 'special'],
  ['Quién eres', 'Controlas al más cercano al balón. El anillo de color te dice quién eres. Sin balón, un toque rápido de <b>Pase</b> cambia de jugador.', 'move'],
  ['Quitar el balón', 'Cerca del rival, <b>Tiro</b> le roba de frente. Lejos, te tiras en barrida. <b>Mantén Pase</b> para marcarlo: te pones entre él y tu arco.', 'shoot'],
  ['Tiro libre', 'Si derriban a tu jugador cerca del arco, hay tiro libre con barrera. Sube y baja la mira con el stick, empuja <b>hacia el arco</b> para dar efecto y toca <b>Tiro</b> cuando el medidor diga <b>¡AHORA!</b>.', 'shoot'],
  ['Penales', 'Si empatan, se define en penales. Mueve el stick a los lados para apuntar y <b>arriba o abajo</b> para la altura, y toca <b>Tiro</b>. Muy alto se va por encima del travesaño.', 'move'],
  ['Saltar escenas', 'Toca la pantalla o cualquier botón para saltar las cinemáticas, el gol y la repetición.', ''],
];

export function tipsHtml(): string {
  return `<div class="tips">${TIPS.map(([t, d, k]) => `<div class="tip"><span class="tdot" style="--kc:${COL[(k || 'neutral') as keyof typeof COL]}"></span><div><b>${t}</b><p>${d}</p></div></div>`).join('')}</div>`;
}

/** The whole panel: tabs, the picture of the tab and its small switches. */
export function guideHtml(tab: Tab, opt: { two?: boolean; easy?: boolean } = {}): string {
  const tabs = ([['teclado', 'Teclado'], ['tactil', 'Pantalla táctil'], ['trucos', 'Trucos']] as [Tab, string][]).map(([k, l]) => `<button class="chip-o${k === tab ? ' sel' : ''}" data-tab="${k}">${l}</button>`).join('');
  let body = '', sw = '';
  if (tab === 'teclado') {
    body = keyboardHtml(!!opt.two);
    sw = `<div class="chips" id="gk">${[['1 jugador', false], ['2 jugadores', true]].map(([l, v]) => `<button class="chip-o${!!v === !!opt.two ? ' sel' : ''}" data-two="${v ? 1 : 0}">${l}</button>`).join('')}</div>`;
  } else if (tab === 'tactil') {
    body = touchHtml(!!opt.easy);
    sw = `<div class="chips" id="gt">${[['Controles completos', false], ['Controles fáciles', true]].map(([l, v]) => `<button class="chip-o${!!v === !!opt.easy ? ' sel' : ''}" data-easy="${v ? 1 : 0}">${l}</button>`).join('')}</div>`
      + `<p class="gnote">${opt.easy ? 'Con los fáciles solo hay dos botones: <b>¡Patea!</b> decide solo entre tiro y pase, y <b>Especial</b>.' : 'En dos jugadores la pantalla se divide en dos mitades y cada una tiene sus botones.'}</p>`;
  } else body = tipsHtml();
  return `<div class="gtabs" id="gtabs">${tabs}</div>${sw}<div class="gbody">${body}</div>`;
}

/** Clicks on the tabs and switches of a rendered guide: calls `again` with the new state. */
export function bindGuide(root: HTMLElement, state: { tab: Tab; two: boolean; easy: boolean }, again: () => void): void {
  root.querySelectorAll<HTMLElement>('[data-tab]').forEach((b) => b.addEventListener('click', () => { state.tab = b.dataset.tab as Tab; again(); }));
  root.querySelectorAll<HTMLElement>('[data-two]').forEach((b) => b.addEventListener('click', () => { state.two = b.dataset.two === '1'; again(); }));
  root.querySelectorAll<HTMLElement>('[data-easy]').forEach((b) => b.addEventListener('click', () => { state.easy = b.dataset.easy === '1'; again(); }));
}

/** The guide as a window over anything (the pause menu, the title). Returns the element; `onClose` runs when it closes. */
export function showGuideWindow(onClose: () => void = () => undefined, start: Partial<{ tab: Tab; two: boolean; easy: boolean }> = {}): HTMLElement {
  const st = { tab: defaultTab(), two: false, easy: false, ...start };
  const box = document.createElement('div'); box.className = 'screen dim'; box.id = 'guide-window';
  const render = (): void => {
    box.innerHTML = `<div class="panel gpanel"><h2>Cómo se juega</h2>${guideHtml(st.tab, st)}<div class="row"><button class="btn primary" id="gclose" data-focus>Listo</button></div></div>`;
    bindGuide(box, st, render);
    box.querySelector('#gclose')!.addEventListener('click', () => { box.remove(); onClose(); });
  };
  render();
  document.getElementById('ui')!.appendChild(box);
  (box.querySelector('#gclose') as HTMLElement).focus({ preventScroll: true });
  return box;
}

interface Step { title: string; text: string; focus: Focus }
/** The short tour of the first match (4 cards, or 3 with the easy controls). It runs over the paused match. */
export function runCoach(opt: { touch: boolean; easy: boolean }, onDone: () => void): HTMLElement {
  const steps: Step[] = [
    { title: 'Mueve a tu jugador', text: opt.touch ? 'Pon el pulgar izquierdo en la pantalla y arrástralo.' : 'Usa W A S D o las flechas.', focus: 'move' },
    { title: opt.easy ? '¡Patea!' : 'Tiro', text: opt.easy ? 'Toca ¡Patea! con el balón: tira al arco o pasa solo, lo mejor en el momento.' : opt.touch ? 'Toca Tiro para patear. Mantenlo para más potencia.' : 'Toca J (o Espacio) para patear. Mantenlo para más potencia.', focus: 'shoot' },
    ...(opt.easy ? [] : [{ title: 'Pase', text: opt.touch ? 'Toca Pase para un pase raso. Mantenlo y suéltalo para un pase alto.' : 'Toca K para un pase raso. Mantenlo y suéltalo para un pase alto.', focus: 'pass' as Focus }]),
    { title: 'Tu poder', text: 'Cuando se llene la barra ★ de arriba y estés cerca del arco, ' + (opt.touch ? 'toca Especial.' : 'toca I (o Enter).') + ' ¡Sale una película!', focus: 'special' },
  ];
  let i = 0;
  const box = document.createElement('div'); box.className = 'screen dim coach'; box.id = 'coach';
  const render = (): void => {
    const s = steps[i], last = i === steps.length - 1;
    const pic = opt.touch ? touchHtml(opt.easy, s.focus) : keyboardHtml(false, s.focus);
    box.innerHTML = `<div class="panel cpanel"><div class="cstep">${i + 1} de ${steps.length}</div><h2>${s.title}</h2><p class="ctext">${s.text}</p><div class="cpic">${pic}</div>
      <div class="row"><button class="btn primary" id="cnext" data-focus>${last ? '¡A jugar!' : 'Siguiente'}</button><button class="btn" id="cskip">Saltar guía</button></div></div>`;
    box.querySelector('#cnext')!.addEventListener('click', () => { if (last) { box.remove(); onDone(); } else { i++; render(); } });
    box.querySelector('#cskip')!.addEventListener('click', () => { box.remove(); onDone(); });
    (box.querySelector('#cnext') as HTMLElement).focus({ preventScroll: true });
  };
  render();
  document.getElementById('ui')!.appendChild(box);
  return box;
}
