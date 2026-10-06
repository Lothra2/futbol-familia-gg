import type { InputRouter } from './router';
import { BTNS } from './router';

const DEAD = 0.22;
interface PadState { axes: readonly number[]; buttons: readonly { pressed: boolean }[] }

/** Standard mapping: left stick or d-pad moves, A shoots, X passes, B or RB sprints, Y uses the special, Start pauses.
 *  `window.__mockPads` lets automated tests feed a simulated pad (reported as simulated in the QA notes). */
export class GamepadInput {
  private seen = new Set<number>();
  private prevStart = new Map<number, boolean>();
  private slotOf = new Map<number, number>();
  slots = 1;
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
      if (b[14]?.pressed) mx = -1; if (b[15]?.pressed) mx = 1; if (b[12]?.pressed) my = -1; if (b[13]?.pressed) my = 1;
      this.router.setAxis(slot, src, mx, my);
      this.router.setButton(slot, src, 'shoot', !!b[0]?.pressed);
      this.router.setButton(slot, src, 'pass', !!b[2]?.pressed);
      this.router.setButton(slot, src, 'sprint', !!(b[1]?.pressed || b[5]?.pressed));
      this.router.setButton(slot, src, 'special', !!b[3]?.pressed);
      const start = !!b[9]?.pressed;
      if (start && !this.prevStart.get(i)) this.router.pause();
      this.prevStart.set(i, start);
    });
  }
}
