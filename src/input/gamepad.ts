import type { InputRouter } from './router';
import { BTNS } from './router';

const DEAD = 0.22;
interface PadState { axes: readonly number[]; buttons: readonly { pressed: boolean; value?: number }[] }
/** A button counts as down when it says so or, a trigger, when it is a third of the way in (some pads only give the value). */
const down = (b: { pressed: boolean; value?: number } | undefined): boolean => !!b && (b.pressed || (b.value ?? 0) > 0.35);
const key = (k: string, code: string): void => { window.dispatchEvent(new KeyboardEvent('keydown', { key: k, code, bubbles: true })); window.dispatchEvent(new KeyboardEvent('keyup', { key: k, code, bubbles: true })); };

/** Standard mapping (an Xbox pad, the Elite 2 on an iPad): left stick or d-pad moves, A shoots, X passes, B, RB or RT sprints, Y uses the special,
 *  LB or LT jumps, Menu pauses, View is "seguir" in a goal party.
 *  Out of the play (the menus, the pause, the scoreboard of a goal, the replay, the result) the pad drives the screen instead: the stick or the
 *  d-pad moves the focus, A presses, B goes back. The keys it sends carry the code `Pad…`, which the keyboard of the match does not know.
 *  `window.__mockPads` lets automated tests feed a simulated pad (reported as simulated in the QA notes). */
export class GamepadInput {
  private seen = new Set<number>();
  private prevStart = new Map<number, boolean>();
  private slotOf = new Map<number, number>();
  slots = 1;
  /** Somebody is playing with a pad (the buttons on the screen step aside), and a pad has just been plugged in or woken up. */
  onUse?: () => void;
  private navPrev = new Map<number, { dir: string; t: number; a: boolean; b: boolean; v: boolean }>();
  constructor(private router: InputRouter, private onDisconnect: (index: number) => void, private onConnect?: (index: number) => void) {
    window.addEventListener('gamepaddisconnected', (e) => { this.release((e as GamepadEvent).gamepad.index); this.onDisconnect((e as GamepadEvent).gamepad.index); });
    window.addEventListener('gamepadconnected', (e) => this.onConnect?.((e as GamepadEvent).gamepad.index));
    const loop = () => { this.poll(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  private pads(): (PadState | null)[] {
    const mock = (window as any).__mockPads as (PadState | null)[] | undefined;
    if (mock) return mock;
    try { return Array.from(navigator.getGamepads?.() ?? []); } catch { return []; }
  }
  private release(i: number): void {
    const s = this.slotOf.get(i); if (s === undefined) return;
    this.router.setAxis(s, `pad${i}`, 0, 0);
    for (const b of BTNS) this.router.setButton(s, `pad${i}`, b, false);
    this.slotOf.delete(i); this.seen.delete(i);
  }

  /** Is the match being played right now? Otherwise a screen is up and the pad drives it. */
  private playing(): boolean {
    const hud = document.getElementById('hud');
    return !!hud && !hud.classList.contains('hidden') && !hud.classList.contains('cinema') && !document.querySelector('#pause-menu, #result, #credits-screen, #marcador, #vs');
  }
  /** The pad on a screen: the focus moves with the stick (it repeats while held), A presses what has it, B goes back. */
  private nav(i: number, p: PadState, mx: number, my: number): void {
    const now = performance.now(), prev = this.navPrev.get(i) ?? { dir: '', t: 0, a: true, b: true, v: true };
    const dir = Math.abs(my) > 0.5 ? (my < 0 ? 'ArrowUp' : 'ArrowDown') : Math.abs(mx) > 0.5 ? (mx < 0 ? 'ArrowLeft' : 'ArrowRight') : '';
    const a = down(p.buttons[0]), b = down(p.buttons[1]);
    const box = [...document.querySelectorAll<HTMLElement>('#pause-menu, #result, #credits-screen')].pop();
    if (dir && (dir !== prev.dir || now > prev.t)) {
      prev.t = now + (dir !== prev.dir ? 380 : 150);
      const act = document.activeElement as HTMLInputElement | null;
      if (act && act.tagName === 'INPUT' && act.type === 'range' && (dir === 'ArrowLeft' || dir === 'ArrowRight')) {
        // a slider: the stick turns it
        act.value = String(Math.max(Number(act.min || 0), Math.min(Number(act.max || 100), Number(act.value) + (dir === 'ArrowRight' ? 5 : -5))));
        act.dispatchEvent(new Event('input', { bubbles: true })); act.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (box) {
        // the pause, the result and the credits have no keys of their own: the focus walks their buttons
        const items = [...box.querySelectorAll<HTMLElement>('button:not([disabled])')].filter((e) => e.offsetParent !== null);
        const at = items.indexOf(document.activeElement as HTMLElement), step = dir === 'ArrowDown' || dir === 'ArrowRight' ? 1 : -1;
        if (items.length) items[at < 0 ? 0 : (at + step + items.length) % items.length]!.focus();
      } else key(dir, 'Pad' + dir);
    }
    prev.dir = dir;
    if (a && !prev.a) {
      const act = document.activeElement as HTMLElement | null;
      if (box) { if (act && box.contains(act) && act.tagName === 'BUTTON') act.click(); else box.querySelector<HTMLElement>('button:not([disabled])')?.focus(); }
      else key('Enter', 'PadA');
    }
    if (b && !prev.b) { if (document.getElementById('pause-menu')) this.router.pause(); else if (!box) key('Escape', 'PadB'); }
    prev.a = a; prev.b = b;
    this.navPrev.set(i, prev);
  }

  poll(): void {
    const pads = this.pads();
    let next = 0;
    pads.forEach((p, i) => {
      if (!p) { if (this.seen.has(i)) { this.release(i); this.onDisconnect(i); } return; }
      this.seen.add(i);
      let slot = this.slotOf.get(i);
      if (slot === undefined) { slot = Math.min(next, this.slots - 1); this.slotOf.set(i, slot); }
      next++;
      const src = `pad${i}`;
      const a = p.axes, b = p.buttons;
      let mx = a[0] ?? 0, my = a[1] ?? 0;
      if (Math.hypot(mx, my) < DEAD) { mx = 0; my = 0; }
      if (down(b[14])) mx = -1; if (down(b[15])) mx = 1; if (down(b[12])) my = -1; if (down(b[13])) my = 1;
      if (mx || my || p.buttons.some((q) => down(q))) this.onUse?.();
      // "seguir" in a goal party, where every other button is a gesture
      const view = down(b[8]), pv = this.navPrev.get(i);
      if (view && !(pv?.v ?? false)) key('q', 'KeyQ');
      if (pv) pv.v = view; else this.navPrev.set(i, { dir: '', t: 0, a: true, b: true, v: view });
      if (!this.playing()) {
        this.router.setAxis(slot, src, 0, 0); for (const k of BTNS) this.router.setButton(slot, src, k, false);
        this.nav(i, p, mx, my);
        const st = down(b[9]); if (st && !this.prevStart.get(i)) this.router.pause(); this.prevStart.set(i, st);
        return;
      }
      const np = this.navPrev.get(i); if (np) { np.a = true; np.b = true; np.dir = ''; }
      this.router.setAxis(slot, src, mx, my);
      this.router.setButton(slot, src, 'shoot', down(b[0]));
      this.router.setButton(slot, src, 'pass', down(b[2]));
      this.router.setButton(slot, src, 'sprint', down(b[1]) || down(b[5]) || down(b[7]));
      this.router.setButton(slot, src, 'special', down(b[3]));
      this.router.setButton(slot, src, 'jump', down(b[4]) || down(b[6]));
      const start = down(b[9]);
      if (start && !this.prevStart.get(i)) this.router.pause();
      this.prevStart.set(i, start);
    });
  }
}
