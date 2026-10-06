import { emptyInput, type InputFrame } from '../core/types';

export type Btn = 'shoot' | 'pass' | 'sprint' | 'special';
export const BTNS: Btn[] = ['shoot', 'pass', 'sprint', 'special'];
interface SlotState { axes: Map<string, [number, number]>; held: Map<string, Set<Btn>>; latch: Set<Btn> }

/** Single source of truth for human input. Keyboard, touch and gamepad push into it per player slot.
 *  Press latches live until the next simulation step consumes them, so a tap shorter than one frame is never lost. */
export class InputRouter {
  private slots: SlotState[] = [0, 1].map(() => ({ axes: new Map(), held: new Map(), latch: new Set() }));
  private pauseCbs: (() => void)[] = [];

  setAxis(slot: number, src: string, mx: number, my: number): void { this.slots[slot]?.axes.set(src, [mx, my]); }
  setButton(slot: number, src: string, b: Btn, down: boolean): void {
    const s = this.slots[slot]; if (!s) return;
    let set = s.held.get(src); if (!set) { set = new Set(); s.held.set(src, set); }
    if (down) { if (!set.has(b)) { set.add(b); s.latch.add(b); } } else set.delete(b);
  }
  onPause(cb: () => void): void { this.pauseCbs.push(cb); }
  pause(): void { for (const cb of this.pauseCbs) cb(); }

  /** Builds this step's frame. Held flags are the OR of all sources, pressed flags come from the latch. */
  frame(slot: number): InputFrame {
    const s = this.slots[slot]; if (!s) return emptyInput();
    let mx = 0, my = 0, best = 0;
    for (const [mx2, my2] of s.axes.values()) { const m = Math.hypot(mx2, my2); if (m > best) { best = m; mx = mx2; my = my2; } }
    const held = (b: Btn): boolean => { for (const set of s.held.values()) if (set.has(b)) return true; return false; };
    return {
      mx, my, shoot: held('shoot'), pass: held('pass'), sprint: held('sprint'), special: held('special'),
      shootPressed: s.latch.has('shoot'), passPressed: s.latch.has('pass'), specialPressed: s.latch.has('special'),
    };
  }
  endStep(): void { for (const s of this.slots) s.latch.clear(); }
  releaseAll(slot?: number): void {
    const list = slot === undefined ? this.slots : [this.slots[slot]];
    for (const s of list) if (s) { s.axes.clear(); s.held.clear(); s.latch.clear(); }
  }
  /** Held now? Used by the touch UI to light buttons. */
  isHeld(slot: number, b: Btn): boolean { const s = this.slots[slot]; if (!s) return false; for (const set of s.held.values()) if (set.has(b)) return true; return false; }
}
