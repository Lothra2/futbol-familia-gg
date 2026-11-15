import { MID, PITCH } from './field';
import type { Match, Player } from './state';
import { T } from './tuning';

const attackDir = (team: number): number => (team === 0 ? 1 : -1);

/** The places of a corner in front of the goal: the first two are for the cross, the third waits for the rebound at the edge. */
function spots(m: Match): { x: number; y: number }[] {
  const r = m.restart!, dir = attackDir(r.team), gx = r.team === 0 ? PITCH.w : 0;
  const far = r.y < MID ? 1 : -1;   // (away from the corner it is taken from)
  const C = T.corner;
  return [
    { x: gx - dir * C.near, y: MID - far * C.nearY },
    { x: gx - dir * C.far, y: MID + far * C.farY },
    { x: gx - dir * C.edge, y: MID },
  ];
}

/** Where this player waits for a corner: an attacker in one of the places of the box, a defender marking one of them. Null: his usual place. */
export function cornerSpot(m: Match, p: Player): { x: number; y: number } | null {
  const r = m.restart;
  if (!r || r.kind !== 'corner') return null;
  const sp = spots(m), dir = attackDir(r.team);
  const rank = (team: number): Player[] => m.players.filter((q) => q.team === team && q.role !== 'gk' && q.id !== r.taker).sort((a, b) => a.slot - b.slot);
  if (p.team === r.team) {
    // the forwards go in (the highest slots), whoever plays at the back stays
    const i = rank(r.team).reverse().indexOf(p);
    return i >= 0 && i < sp.length ? sp[i] : null;
  }
  // the defence: the first place is marked tight, the second from further away, so there is always somebody to cross to
  const i = rank(p.team).indexOf(p);
  if (i === 0) return { x: sp[0].x + dir * T.corner.tight, y: sp[0].y };
  if (i === 1) return { x: sp[1].x + dir * T.corner.loose, y: sp[1].y - Math.sign(sp[1].y - MID) * 6 };
  return null;
}

/**
 * Who the corner goes to: the mate the stick points at, or with the stick still the one in the box with the most room. The cross lands
 * a little away from the rival who marks him. Null when nobody of the team is near the goal (the cross goes to the front of the goal).
 */
export function cornerTarget(m: Match, t: Player, sx: number, sy: number): { id: number; x: number; y: number } | null {
  const r = m.restart!, gx = r.team === 0 ? PITCH.w : 0, stick = Math.hypot(sx, sy);
  const foes = m.players.filter((q) => q.team !== t.team && q.role !== 'gk');
  let best: { q: Player; s: number; fx: number; fy: number } | null = null;
  for (const q of m.players) {
    if (q.team !== t.team || q.role === 'gk' || q.id === t.id || Math.abs(q.x - gx) > T.corner.reach) continue;
    let room = 60, fx = 0, fy = 0;
    for (const o of foes) { const d = Math.hypot(o.x - q.x, o.y - q.y); if (d < room) { room = d; fx = q.x - o.x; fy = q.y - o.y; } }
    let s = room - Math.abs(q.x - gx) * 0.12;
    if (stick > 0.35) {
      const d = Math.hypot(q.x - t.x, q.y - t.y) || 1;
      const ang = Math.acos(Math.max(-1, Math.min(1, ((q.x - t.x) * sx + (q.y - t.y) * sy) / (d * stick))));
      // (the stick chooses among the ones in the box; pointing nowhere near any of them leaves the choice to the room they have)
      if (ang <= T.passConeWide) s = 200 - ang * 60;
    }
    if (!best || s > best.s) best = { q, s, fx, fy };
  }
  if (!best) return null;
  const n = Math.hypot(best.fx, best.fy);
  const k = n > 0 && n < 30 ? T.corner.away / n : 0;
  return { id: best.q.id, x: best.q.x + best.fx * k, y: best.q.y + best.fy * k };
}
