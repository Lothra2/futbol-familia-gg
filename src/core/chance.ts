import { T } from './tuning';
import { PITCH, goalX } from './field';
import type { Match, Player } from './state';

const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

/**
 * How good a chance a shot is, 0 to 1 (docs/MEJORAS_JUGABILIDAD.md, mejora 3). Read when the keeper rolls the save, so a shot from close, in front of goal,
 * into the corner away from the keeper and with nobody on the line is a goal much more often than a shot from far, from the wing or into the keeper's arms.
 * `ty` is the height (y) the shot is aimed at.
 */
export function shotQuality(m: Match, shooter: Player, ty: number, first: boolean): number {
  const C = T.chance, b = m.ball, gx = goalX(shooter.team);
  const dist = Math.abs(gx - b.x);
  let q = dist <= C.near ? 1 : dist >= C.far ? C.farFloor : 1 - ((dist - C.near) / (C.far - C.near)) * (1 - C.farFloor);
  // from the wing the angle is bad
  q *= 1 - C.lateralPen * clamp((Math.abs(b.y - PITCH.d / 2) - C.lateral) / C.lateralSpan, 0, 1);
  // into the corner away from the keeper
  const gk = m.players.find((p) => p.team !== shooter.team && p.role === 'gk');
  if (gk && Math.abs(ty - gk.y) > C.cornerGap) q += C.corner;
  // rivals on the line of the shot
  let traffic = 0;
  for (const o of m.players) {
    if (o.team === shooter.team || o.role === 'gk') continue;
    const dx = gx - b.x, dy = PITCH.d / 2 - b.y, l2 = dx * dx + dy * dy || 1, u = clamp(((o.x - b.x) * dx + (o.y - b.y) * dy) / l2, 0, 1);
    if (u > 0.05 && Math.hypot(o.x - (b.x + dx * u), o.y - (b.y + dy * u)) < C.trafficDist) traffic++;
  }
  q -= C.traffic * traffic;
  if (first) q += C.first;
  return clamp(q, 0, 1);
}
