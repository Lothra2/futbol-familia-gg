import { PITCH, attackDir, slotPos } from '../field';
import type { Match, Player } from '../state';

export type Mode = 'neutral' | 'attack' | 'defend';
const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

/** Where a field player stands when he has nothing better to do: his slot in the 2-2, pushed by the ball, forward in attack and back in defence. */
export function formationTarget(m: Match, p: Player, mode: Mode): { x: number; y: number } {
  const base = slotPos(p.team, p.slot), b = m.ball, dir = attackDir(p.team);
  let x = base.x + (b.x - PITCH.w / 2) * 0.5;
  if (mode === 'attack') x += dir * 60;
  else if (mode === 'defend') x -= dir * 80;
  const y = base.y + (b.y - PITCH.d / 2) * 0.25;
  return { x: clamp(x, 40, PITCH.w - 40), y: clamp(y, 14, PITCH.d - 14) };
}

/** Attack or defend only after a team has kept the ball for a second, so a scrum in the middle does not make the whole team run back and forth. */
export function teamMode(m: Match, p: Player): Mode {
  const team = m.data.holdTeam as number | undefined, since = (m.data.holdSince as number | undefined) ?? 0;
  if (team === undefined || m.t - since < 1.0 || m.ball.owner === null) return 'neutral';
  return team === p.team ? 'attack' : 'defend';
}
