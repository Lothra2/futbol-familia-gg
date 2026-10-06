/** Looping sprite animation, kept free of Phaser so it can be unit tested. */
export interface AnimMeta { start: number; frames: number; fps: number; loop: boolean }

/** Walk, run and the dog's zoomies are the same leg cycle at different speeds, so the cycle keeps its place when one gives way to another. */
export const LOCOMOTION = new Set(['walk', 'run', 'carry_run', 'zoomies']);

/**
 * Phase of a looping animation. The phase (0..1 of one cycle) grows by dt * fps * pace / frames, so a change of speed only changes how fast it
 * grows. The old code took (total elapsed time x speed ratio), which made the frame jump by (elapsed time x change of ratio) every time the
 * speed moved a little, more and more as the event went on.
 *
 * Guarantees: the frame index only ever advances to the next pose (never skips one, even after a long hitch) and the pace eases toward the
 * wanted speed instead of switching.
 */
export class LoopClock {
  anim = '';
  cycle = 0;
  pace = 1;

  /** Eases the pace toward `want`. Call every update, in every state, so it is ready when a loop starts. */
  ease(want: number, dt: number): void { this.pace += (want - this.pace) * (1 - Math.exp(-dt / 0.08)); }

  /** Absolute frame index in the atlas row for animation `name` after `dt` seconds. */
  frame(anims: Record<string, AnimMeta>, name: string, dt: number): number {
    const key = anims[name] ? name : 'idle';
    const a = anims[key];
    if (key !== this.anim) {
      if (!(LOCOMOTION.has(key) && LOCOMOTION.has(this.anim))) this.cycle = 0;
      this.anim = key;
    }
    if (a.frames > 1 && a.fps > 0) {
      const poses = Math.min(1, Math.max(0, dt) * a.fps * this.pace);   // at most one pose per update: no frame is ever lost
      this.cycle = (this.cycle + poses / a.frames) % 1;
    }
    return a.start + Math.min(a.frames - 1, Math.floor(this.cycle * a.frames + 1e-9));
  }
}
