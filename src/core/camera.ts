import { attackDir } from './field';
import { BOUNDS, sx, sy } from './proj';
import type { Match } from './state';

/** Scroll of the camera in screen pixels (the top left corner of the view) and the time left of a shake. */
export interface Cam { x: number; y: number; shake: number }
export const newCam = (): Cam => ({ x: 0, y: 0, shake: 0 });

const clampAxis = (v: number, lo: number, hi: number, view: number): number => (hi - lo <= view ? (lo + hi - view) / 2 : Math.max(lo, Math.min(hi - view, v)));

/** Where the camera wants to be: the ball in the middle (both axes, like Nintendo World Cup), a little ahead of where it goes and of a human who
 *  carries it. `bottomInset` is the band the HUD covers at the bottom of the screen, so the ball is centred in what is really visible. */
export function cameraTarget(m: Match, viewW: number, viewH = 270, bottomInset = 0): { x: number; y: number } {
  const b = m.ball;
  let tx = sx(b.x + Math.max(-60, Math.min(60, b.vx * 0.25)));
  const ty = sy(b.y + Math.max(-30, Math.min(30, b.vy * 0.15)), Math.min(b.z, 40) * 0.5);
  const o = m.players.find((p) => p.id === b.owner);
  if (o && o.control === 'human') tx += sx(40) * attackDir(o.team);
  const h = viewH - bottomInset;
  return { x: clampAxis(tx - viewW / 2, BOUNDS.x0, BOUNDS.x1, viewW), y: clampAxis(ty - h / 2, BOUNDS.y0, BOUNDS.y1 + bottomInset, viewH) };
}

/** Smooth follow on both axes. `first` snaps. */
export function updateCamera(c: Cam, m: Match, viewW: number, dt: number, first = false, viewH = 270, bottomInset = 0): void {
  const t = cameraTarget(m, viewW, viewH, bottomInset);
  const k = first ? 1 : Math.min(1, 5 * dt);
  c.x += (t.x - c.x) * k; c.y += (t.y - c.y) * k;
  c.x = clampAxis(c.x, BOUNDS.x0, BOUNDS.x1, viewW); c.y = clampAxis(c.y, BOUNDS.y0, BOUNDS.y1 + bottomInset, viewH);
  c.shake = Math.max(0, c.shake - dt);
}
export const shakeCamera = (c: Cam, s = 0.2): void => { c.shake = Math.max(c.shake, s); };
