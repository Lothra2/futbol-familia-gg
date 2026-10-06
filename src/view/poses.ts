import type { AnimMeta } from './anim';
import type { Player } from '../core/state';

/** What a player is doing, in the words of the game. Each one is drawn with the first animation that exists in the atlas of that character,
 *  so the art can grow (M4 and M6 add the soccer rows) without touching the code. */
export type Logical = 'idle' | 'run' | 'shot' | 'pass' | 'chip' | 'volley' | 'header' | 'chilena' | 'slide' | 'bump' | 'stagger' | 'tumble' | 'dizzy' | 'getup'
  | 'celebrate' | 'sad' | 'special' | 'hold' | 'dive' | 'gkIdle';
export type Atlas = Record<string, AnimMeta>;

export const CHAIN: Record<Logical, string[]> = {
  idle: ['idle', 'sit_idle'], run: ['run'], gkIdle: ['gk_ready', 'idle', 'sit_idle'],
  shot: ['shot', 'headpush', 'throw'], pass: ['pass', 'shot', 'headpush', 'throw'], chip: ['chip', 'pass', 'shot', 'headpush', 'throw'], volley: ['volley', 'shot', 'headpush', 'throw'],
  header: ['header', 'headpush', 'jump_apex'], chilena: ['chilena', 'jump_fall', 'jump_apex'],
  slide: ['slide', 'land', 'tumble'], bump: ['bump', 'push', 'headpush', 'stagger'], stagger: ['stagger'], tumble: ['tumble', 'roll'], dizzy: ['dizzy', 'stagger'], getup: ['land', 'idle', 'sit_idle'],
  celebrate: ['dance', 'celebrate', 'celebrate_tailchase', 'call'], sad: ['lose', 'sad', 'stagger'], special: ['power', 'zoomies', 'celebrate', 'call'],
  hold: ['gk_hold', 'carry_idle', 'gk_ready', 'idle', 'sit_idle'], dive: ['gk_dive', 'jump_apex', 'jump_rise'],
};
const FALLBACK = 'idle';

/** Name of the animation to play for a logical pose. */
export function resolvePose(atlas: Atlas, l: Logical): string {
  for (const n of CHAIN[l]) if (atlas[n]) return n;
  return atlas[FALLBACK] ? FALLBACK : Object.keys(atlas)[0];
}

/** The logical pose of a player this moment, from the state of the core. */
export function logicalPose(p: Player): Logical {
  switch (p.state) {
    case 'kick': { const s = p.act?.sub; return s === 'pass' || s === 'restart' ? 'pass' : s === 'chip' ? 'chip' : s === 'volley' ? 'volley' : s === 'header' ? 'header' : s === 'chilena' ? 'chilena' : 'shot'; }
    case 'slide': return 'slide';
    case 'bump': return 'bump';
    case 'stagger': return 'stagger';
    case 'tumble': return 'tumble';
    case 'dizzy': return 'dizzy';
    case 'getup': return 'getup';
    case 'celebrate': return 'celebrate';
    case 'sad': return 'sad';
    case 'special': return 'special';
    case 'hold': return 'hold';
    case 'dive': return 'dive';
    default: return Math.hypot(p.vx, p.vy) < 8 ? (p.role === 'gk' ? 'gkIdle' : 'idle') : 'run';
  }
}

/** Loops are driven by the phase clock (anim.ts). Everything else is a sequence of poses that follows the time of the action. */
export const isLoop = (l: Logical): boolean => l === 'idle' || l === 'run' || l === 'gkIdle' || l === 'celebrate' || l === 'dizzy';

/** Frame (0-based, inside the animation) of a pose that is not a loop. `t` is the time since the action began. */
export function sequenceFrame(a: AnimMeta, l: Logical, t: number, p: Player): number {
  const n = a.frames, last = n - 1;
  if (n <= 1) return 0;
  const act = p.act;
  switch (l) {
    case 'shot': case 'pass': case 'chip': case 'volley': case 'header': case 'chilena': {
      const contact = act?.contact ?? 0.1, after = t - contact;
      if (t < contact) return 0;                    // wind-up
      if (n === 2) return 1;
      return after < 0.09 ? 1 : Math.min(last, 2);  // contact, then follow-through
    }
    case 'slide': return t < 0.12 ? 0 : last;
    case 'dive': return t < 0.12 ? 0 : last;
    case 'tumble': return Math.min(last, Math.floor((t / Math.max(0.01, act?.dur ?? 0.7)) * n));
    case 'bump': return Math.min(last, Math.floor((t / Math.max(0.01, act?.dur ?? 0.2)) * n));
    case 'special': return Math.min(last, Math.floor(t / 0.15));
    default: return 0;
  }
}

/** Keeps a pose on screen at least `min` seconds and waits 100 ms before going to the standing pose (ART_BIBLE section 6). */
export class PoseSmoother {
  logical: Logical = 'idle';
  private since = 0;
  private pending: Logical | null = null;
  private pendingT = 0;
  static readonly MIN = 0.07;
  static readonly IDLE_DELAY = 0.1;

  /** Feeds the wanted pose and the time passed; returns the pose to draw. */
  update(want: Logical, dt: number): Logical {
    this.since += dt;
    if (want === this.logical) { this.pending = null; return this.logical; }
    const toStand = want === 'idle' || want === 'gkIdle';
    if (this.pending !== want) { this.pending = want; this.pendingT = 0; }
    this.pendingT += dt;
    // it has been drawn at least MIN seconds, and going to the standing pose also waits IDLE_DELAY since it was asked
    if (this.since >= PoseSmoother.MIN && (!toStand || this.pendingT >= PoseSmoother.IDLE_DELAY)) { this.logical = want; this.since = 0; this.pending = null; }
    return this.logical;
  }
}
