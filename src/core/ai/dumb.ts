import { PITCH, attackDir, goalX, ownGoalX, slotPos } from '../field';
import { emptyInput, type InputFrame } from '../types';
import type { Match, Player } from '../state';

const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

/** The M1 stand-in for the team AI (M2 replaces it): everybody chases the ball and shoots when close to goal. It exists to exercise the rules. */
export function dumbThink(m: Match, p: Player): InputFrame {
  const f = emptyInput(), b = m.ball, dir = attackDir(p.team), gx = goalX(p.team);
  const go = (x: number, y: number): void => { const dx = x - p.x, dy = y - p.y, d = Math.hypot(dx, dy); if (d > 3) { f.mx = dx / d; f.my = dy / d; } };
  const tap = (k: 'shoot' | 'pass'): void => { if (k === 'shoot') f.shootPressed = true; else f.passPressed = true; };
  const own = b.owner === p.id;

  if (p.role === 'gk') {
    if (own) { go(ownGoalX(p.team) + dir * 20, p.y); if (p.holdT > 0.6) tap('pass'); return f; }
    if (b.state === 'free' && b.z < 16 && Math.abs(b.x - ownGoalX(p.team)) < 90 && Math.abs(b.y - 80) < 50 && Math.hypot(b.vx, b.vy) < 120) { go(b.x, b.y); return f; }
    go(ownGoalX(p.team) + dir * 14, clamp(b.y, 62, 98));
    return f;
  }
  const mates = m.players.filter((q) => q.team === p.team && q.role !== 'gk');
  const rank = [...mates].sort((a, c) => Math.hypot(a.x - b.x, a.y - b.y) - Math.hypot(c.x - b.x, c.y - b.y)).indexOf(p);
  if (own) {
    f.sprint = p.stamina > 40;
    go(gx, 80);
    if (m.t >= p.reactionT && Math.abs(gx - p.x) < 220) { tap('shoot'); p.reactionT = m.t + 0.6; }
    else if (m.rng.chance(0.004) && m.t >= p.reactionT) { tap('pass'); p.reactionT = m.t + 0.6; }
    return f;
  }
  const carrier = b.owner === null ? null : m.players.find((q) => q.id === b.owner) ?? null;
  if (carrier && carrier.team !== p.team) {
    if (rank <= 1) {
      go(carrier.x, carrier.y);
      p.facing = carrier.x >= p.x ? 1 : -1;
      if (m.t >= p.reactionT && Math.abs(carrier.x - p.x) < 14 && Math.abs(carrier.y - p.y) < 8) { tap('shoot'); f.shoot = true; p.reactionT = m.t + 0.2; }
    } else { const s = slotPos(p.team, p.slot); go(s.x + (b.x - 480) * 0.4, s.y); }
    return f;
  }
  if (carrier) { const s = slotPos(p.team, p.slot); go(clamp(b.x + dir * 80, 20, PITCH.w - 20), s.y); return f; }   // a teammate has it: run ahead
  if (rank === 0 || (rank === 1 && m.rng.chance(0.5))) {
    go(b.x, b.y);
    if (m.t >= p.reactionT && b.z >= 6 && b.z <= 48 && Math.abs(b.x - p.x) < 18 && Math.abs(b.y - p.y) < 10) { tap('shoot'); f.shoot = true; p.reactionT = m.t + 0.5; }
    return f;
  }
  const s = slotPos(p.team, p.slot); go(s.x + (b.x - 480) * 0.4, s.y);
  return f;
}
