import { CAM_MAX_X, CAM_MIN_X, attackDir } from './field';
import type { Match } from './state';

export interface Cam { x: number; shake: number }
export const newCam = (): Cam => ({ x: 0, shake: 0 });

/** Where the camera wants to be: the ball, a little ahead of where it goes, and a little ahead of a human who carries it. */
export function cameraTarget(m: Match, viewW: number): number {
  const b = m.ball;
  let t = b.x + Math.max(-60, Math.min(60, b.vx * 0.25)) - viewW / 2;
  const o = m.players.find((p) => p.id === b.owner);
  if (o && o.control === 'human') t += 40 * attackDir(o.team);
  return Math.max(CAM_MIN_X, Math.min(CAM_MAX_X - viewW, t));
}

/** Smooth follow. `first` snaps. The y of the camera never moves: the pitch always sits in the same band of the screen. */
export function updateCamera(c: Cam, m: Match, viewW: number, dt: number, first = false): void {
  const t = cameraTarget(m, viewW);
  c.x = first ? t : c.x + (t - c.x) * Math.min(1, 5 * dt);
  c.x = Math.max(CAM_MIN_X, Math.min(CAM_MAX_X - viewW, c.x));
  c.shake = Math.max(0, c.shake - dt);
}
export const shakeCamera = (c: Cam, s = 0.2): void => { c.shake = Math.max(c.shake, s); };
