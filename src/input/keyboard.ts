import type { InputRouter, Btn } from './router';
import { BTNS } from './router';

export type KeyMode = '1p' | '2p';
interface Map1 { up: string[]; down: string[]; left: string[]; right: string[]; shoot: string[]; pass: string[]; sprint: string[]; special: string[] }

/** KeyboardEvent.code based, so it works with Spanish and English layouts. See GAME_DESIGN section 4. */
export const KEYMAPS: Record<KeyMode, Map1[]> = {
  '1p': [{ up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], shoot: ['KeyJ', 'Space'], pass: ['KeyK'], sprint: ['KeyL', 'ShiftLeft', 'ShiftRight'], special: ['KeyI', 'Enter'] }],
  '2p': [
    { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], shoot: ['KeyF'], pass: ['KeyG'], sprint: ['KeyH'], special: ['KeyT'] },
    { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], shoot: ['Comma'], pass: ['Period'], sprint: ['Slash'], special: ['Semicolon'] },
  ],
};
const PAUSE = ['Escape', 'KeyP'];
const SRC = 'kb';

export class KeyboardInput {
  private down = new Set<string>();
  mode: KeyMode = '1p';
  active = false;
  constructor(private router: InputRouter) {
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => this.clear());
  }
  clear(): void { this.down.clear(); this.push(); this.router.releaseAll(); }
  private onKey(e: KeyboardEvent, isDown: boolean): void {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (isDown && PAUSE.includes(e.code) && !e.repeat) { this.router.pause(); return; }
    const used = KEYMAPS[this.mode].some((m) => [...m.up, ...m.down, ...m.left, ...m.right, ...m.shoot, ...m.pass, ...m.sprint, ...m.special].includes(e.code));
    if (this.active && used) e.preventDefault();
    if (e.repeat && isDown) return;
    if (isDown) this.down.add(e.code); else this.down.delete(e.code);
    this.push();
  }
  private push(): void {
    KEYMAPS[this.mode].forEach((m, slot) => {
      const h = (codes: string[]) => codes.some((c) => this.down.has(c));
      const mx = (h(m.right) ? 1 : 0) - (h(m.left) ? 1 : 0), my = (h(m.down) ? 1 : 0) - (h(m.up) ? 1 : 0);
      this.router.setAxis(slot, SRC, mx, my);
      for (const b of BTNS as Btn[]) this.router.setButton(slot, SRC, b, h(m[b]));
    });
  }
}
