import type { Btn, InputRouter } from './router';
import { ICONS } from '../ui/icons';

const SRC = 'touch';
const DEAD = 0.18;
export type ControlMode = 'easy' | 'full';

interface Ptr { kind: 'joy' | 'btn'; slot: number; btn?: Btn; ox: number; oy: number; el?: HTMLElement }
const LABEL: Record<Btn, string> = { shoot: 'Tiro', pass: 'Pase', sprint: 'Sprint', special: 'Especial' };

/** On screen controls. Every finger is bound to the zone where it first touched (pointerId), so one thumb can steer
 *  while another presses a button, and in two player mode each half of the tablet belongs to one player.
 *  Easy controls show only two buttons: "¡Patea!" (it is the shoot button, the core decides between shot and pass) and "Especial". */
export class TouchUI {
  private root = document.getElementById('touch')!;
  private ptrs = new Map<number, Ptr>();
  private players = 1;
  private mirror = false;
  private modes: ControlMode[] = ['full', 'full'];
  private enabled = false;
  private mode: 'auto' | 'on' | 'off' = 'auto';
  private seenTouch = false;
  private bases: HTMLElement[] = [];
  private knobs: HTMLElement[] = [];
  private radius = 52;

  constructor(private router: InputRouter) {
    const r = this.root;
    r.addEventListener('pointerdown', (e) => this.down(e));
    r.addEventListener('pointermove', (e) => this.move(e));
    for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) r.addEventListener(t, (e) => this.up(e as PointerEvent));
    window.addEventListener('touchstart', () => { if (!this.seenTouch) { this.seenTouch = true; this.refresh(); } }, { passive: true });
    window.addEventListener('blur', () => this.releaseAll());
  }

  get coarse(): boolean { return this.seenTouch || (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches); }
  setMode(m: 'auto' | 'on' | 'off'): void { this.mode = m; this.refresh(); }
  /** Rebuilds the layout for the number of players and their control mode. Call when a match starts. */
  configure(players: 1 | 2, mirrorP2: boolean, modes: ControlMode[] = ['full', 'full']): void { this.players = players; this.mirror = mirrorP2; this.modes = modes; this.build(); this.refresh(); }
  show(on: boolean): void { this.enabled = on; this.refresh(); }
  private refresh(): void {
    const visible = this.enabled && (this.mode === 'on' || (this.mode === 'auto' && this.coarse));
    this.root.classList.toggle('on', visible);
    if (!visible) this.releaseAll();
  }

  private btnHtml(b: Btn, easy: boolean): string {
    const icon = easy && b === 'shoot' ? ICONS.kick : ICONS[b];
    const label = easy && b === 'shoot' ? '¡Patea!' : LABEL[b];
    return `<button class="tbtn ${b}" data-b="${b}" aria-label="${label}"><span>${icon}</span><em>${label}</em></button>`;
  }

  private build(): void {
    this.root.innerHTML = '';
    this.bases = []; this.knobs = [];
    const small = this.players === 2;
    for (let s = 0; s < this.players; s++) {
      const mir = s === 1 && this.mirror;
      const easy = this.modes[s] === 'easy';
      const slot = document.createElement('div');
      slot.className = `tslot s${s}${mir ? ' mir' : ''}${small ? ' two' : ''}${easy ? ' easy' : ''}`;
      slot.dataset.slot = String(s);
      slot.style.setProperty('--c', ['#FFD447', '#7BE3FF'][s] ?? '#fff');
      const btns: Btn[] = easy ? ['shoot', 'special'] : ['shoot', 'pass', 'sprint', 'special'];
      slot.innerHTML = `<div class="tbase"><i class="tknob"></i></div>${btns.map((b) => this.btnHtml(b, easy)).join('')}`;
      this.root.appendChild(slot);
      this.bases.push(slot.querySelector('.tbase') as HTMLElement);
      this.knobs.push(slot.querySelector('.tknob') as HTMLElement);
    }
    if (this.players === 2) { const d = document.createElement('div'); d.className = 'tdivider'; this.root.appendChild(d); }
    this.radius = this.players === 2 ? 44 : 52;
  }

  private slotAt(x: number): number {
    if (this.players === 1) return 0;
    return x < window.innerWidth / 2 ? 0 : 1;
  }
  private inJoyZone(slot: number, x: number): boolean {
    const half = this.players === 2 ? window.innerWidth / 2 : window.innerWidth;
    const left = slot === 1 ? half : 0;
    const rel = (x - left) / half;
    const mir = slot === 1 && this.mirror;
    return mir ? rel > 0.45 : rel < 0.55;
  }

  private down(e: PointerEvent): void {
    if (!this.enabled) return;
    e.preventDefault();
    const target = (e.target as HTMLElement).closest('.tbtn') as HTMLElement | null;
    if (target) {
      const slot = Number((target.closest('.tslot') as HTMLElement).dataset.slot);
      const b = target.dataset.b as Btn;
      this.ptrs.set(e.pointerId, { kind: 'btn', slot, btn: b, ox: e.clientX, oy: e.clientY, el: target });
      target.classList.add('held');
      this.router.setButton(slot, SRC, b, true);
      try { this.root.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      return;
    }
    const slot = this.slotAt(e.clientX);
    if (!this.inJoyZone(slot, e.clientX)) return;
    for (const p of this.ptrs.values()) if (p.kind === 'joy' && p.slot === slot) return;   // one stick per player
    this.ptrs.set(e.pointerId, { kind: 'joy', slot, ox: e.clientX, oy: e.clientY });
    const base = this.bases[slot];
    base.style.left = `${e.clientX - this.root.getBoundingClientRect().left}px`; base.style.top = `${e.clientY - this.root.getBoundingClientRect().top}px`;
    base.classList.add('show');
    this.knobs[slot].style.transform = 'translate(0px,0px)';
    this.router.setAxis(slot, SRC, 0, 0);
    try { this.root.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  }

  private move(e: PointerEvent): void {
    const p = this.ptrs.get(e.pointerId);
    if (!p || p.kind !== 'joy') return;
    e.preventDefault();
    let dx = e.clientX - p.ox, dy = e.clientY - p.oy;
    const len = Math.hypot(dx, dy), r = this.radius;
    if (len > r) { dx = (dx / len) * r; dy = (dy / len) * r; }
    this.knobs[p.slot].style.transform = `translate(${dx}px,${dy}px)`;
    const mag = Math.min(1, Math.hypot(dx, dy) / r);
    if (mag < DEAD) { this.router.setAxis(p.slot, SRC, 0, 0); return; }
    const k = ((mag - DEAD) / (1 - DEAD)) / (mag || 1);
    this.router.setAxis(p.slot, SRC, (dx / r) * k * mag, (dy / r) * k * mag);
  }

  private up(e: PointerEvent): void {
    const p = this.ptrs.get(e.pointerId);
    if (!p) return;
    this.ptrs.delete(e.pointerId);
    if (p.kind === 'btn') { p.el?.classList.remove('held'); this.router.setButton(p.slot, SRC, p.btn!, false); }
    else { this.bases[p.slot].classList.remove('show'); this.router.setAxis(p.slot, SRC, 0, 0); }
  }

  releaseAll(): void {
    for (const [id, p] of this.ptrs) { if (p.kind === 'btn') { p.el?.classList.remove('held'); this.router.setButton(p.slot, SRC, p.btn!, false); } else { this.bases[p.slot]?.classList.remove('show'); this.router.setAxis(p.slot, SRC, 0, 0); } this.ptrs.delete(id); }
  }
  /** Debug: number of fingers currently tracked. */
  get active(): number { return this.ptrs.size; }
}
