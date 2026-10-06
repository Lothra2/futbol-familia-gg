import { stepBall } from '../ball';
import { ESCAPE } from '../field';
import type { Match, Player } from '../state';

const N = 32, STEP = 0.05;   // 1.6 s ahead in 0.05 s steps
export interface P3 { x: number; y: number; z: number }

/** Where the ball will be, every 0.05 s for the next 1.6 s. Cached for three steps: ten players asking is one simulation. */
export function trajectory(m: Match): P3[] {
  const b = m.ball, c = m.data.traj as { tick: number; state: string; owner: number | null; touch: number; pts: P3[] } | undefined;
  if (c && m.tick - c.tick < 3 && c.state === b.state && c.owner === b.owner && c.touch === b.lastTouch.t) return c.pts;
  const pts: P3[] = [];
  if (b.state === 'free') {
    const sim = { ...b };
    for (let i = 0; i < N; i++) { pts.push({ x: sim.x, y: sim.y, z: sim.z }); stepBall(sim, STEP); }
  } else if (b.state === 'owned') {
    const o = m.players.find((p) => p.id === b.owner);
    for (let i = 0; i < N; i++) {
      const t = i * STEP;
      pts.push({ x: Math.max(ESCAPE.x0, Math.min(ESCAPE.x1, b.x + (o ? o.vx : 0) * t)), y: Math.max(ESCAPE.y0, Math.min(ESCAPE.y1, b.y + (o ? o.vy : 0) * t)), z: 0 });
    }
  } else for (let i = 0; i < N; i++) pts.push({ x: b.x, y: b.y, z: b.z });
  m.data.traj = { tick: m.tick, state: b.state, owner: b.owner, touch: b.lastTouch.t, pts };
  return pts;
}

export function ballAt(m: Match, t: number): P3 {
  const pts = trajectory(m), f = Math.max(0, Math.min(N - 1.001, t / STEP)), i = Math.floor(f), u = f - i;
  const a = pts[i], b = pts[i + 1];
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, z: a.z + (b.z - a.z) * u };
}

/** Seconds until this player can be at the ball, from its predicted path (running a bit faster than a walk). */
export function etaTo(m: Match, p: Player): number {
  const pts = trajectory(m), v = p.stats.run * p.speedMult * 1.1;
  // a player who is down (or in a dive, a slide, a kick) cannot move yet: he arrives later by the time that is left of what he is doing
  const busy = p.act ? Math.max(0, p.act.dur - p.act.t) : 0;
  for (let i = 0; i < N; i++) {
    if (pts[i].z > 30) continue;
    const d = Math.hypot(pts[i].x - p.x, (pts[i].y - p.y) / 0.7) - 8;
    if (d <= v * Math.max(0, i * STEP - busy)) return i * STEP;
  }
  const last = pts[N - 1];
  return N * STEP + busy + Math.max(0, Math.hypot(last.x - p.x, (last.y - p.y) / 0.7) - 8) / v;
}

/** First point where the ball crosses the goal line at x0, within the next 1.6 s. */
export function crossing(m: Match, x0: number, inward: 1 | -1): { t: number; y: number; z: number } | null {
  const pts = trajectory(m);
  for (let i = 1; i < N; i++) {
    const a = pts[i - 1], b = pts[i];
    if ((a.x - x0) * inward > 0 && (b.x - x0) * inward <= 0) {
      const u = (a.x - x0) / (a.x - b.x || 1);
      return { t: (i - 1 + u) * STEP, y: a.y + (b.y - a.y) * u, z: a.z + (b.z - a.z) * u };
    }
  }
  return null;
}
