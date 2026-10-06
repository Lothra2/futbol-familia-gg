import { createMatch, step, type MatchOptions } from '../../src/core/match';
import { DT } from '../../src/core/step';
import { emptyInput, type CharId, type InputFrame } from '../../src/core/types';
import type { Match, Player } from '../../src/core/state';

/** A match in open play with no AI, so every input of every player is written by the test. All players start at speed x1. */
export function mk(o: MatchOptions = {}, human = false): Match {
  const m = createMatch({ ai: 'none', skipKickoff: true, seed: 1, halfLength: 90, ...o });
  for (const p of m.players) { p.speedMult = 1; if (human) p.control = 'human'; }
  return m;
}
export const fam = (m: Match, c: CharId): Player => m.players.find((p) => p.charId === c)!;
export const rival = (m: Match, slot: number): Player => m.players.find((p) => p.team === 1 && p.slot === slot)!;
export const inp = (p: Partial<InputFrame> = {}): InputFrame => ({ ...emptyInput(), ...p });
export const ticks = (m: Match, n: number, f?: (i: number) => void): void => { for (let i = 0; i < n; i++) { f?.(i); step(m); } };
export const secs = (m: Match, s: number, f?: (t: number) => void): void => ticks(m, Math.round(s / DT), (i) => f?.(i * DT));
export const put = (p: Player, x: number, y: number): void => { p.x = x; p.y = y; p.vx = p.vy = 0; };
export const ball = (m: Match, x: number, y: number, z = 0, vx = 0, vy = 0, vz = 0): void => {
  Object.assign(m.ball, { x, y, z, vx, vy, vz, spin: 0, state: 'free', owner: null, inNet: false, scored: null });
};
export const give = (m: Match, p: Player): void => { m.ball.state = 'owned'; m.ball.owner = p.id; m.ball.inNet = false; m.ball.scored = null; p.immuneT = 0; m.ball.x = p.x + 8; m.ball.y = p.y; m.ball.z = 0; };
/** Everybody far from the middle of the pitch, so nobody touches a test ball. */
export function clear(m: Match, except: Player[] = []): void {
  m.players.forEach((p, i) => { if (!except.includes(p)) put(p, 780 + i * 20, 170); });
}
/** Steps until the next kick or pass event and returns the velocity of the ball in that same step. */
export function untilKick(m: Match, max = 60): { vx: number; vy: number; vz: number; v: number } | null {
  for (let i = 0; i < max; i++) { step(m); const k = kicks(m); if (k.length) return { vx: m.ball.vx, vy: m.ball.vy, vz: m.ball.vz, v: k[k.length - 1].v ?? 0 }; }
  return null;
}
export const kicks = (m: Match): { k: string; v?: number }[] => m.events.filter((e) => e.k === 'kick' || e.k === 'pass');
/** Presses a button for `hold` seconds and lets it go. hold = 0 is a tap that is pressed and released inside one step. */
export function pressShoot(m: Match, p: Player, hold: number, extra: Partial<InputFrame> = {}): void {
  p.input = inp({ ...extra, shoot: hold > 0, shootPressed: true }); step(m);
  const n = Math.round(hold / DT);
  for (let i = 0; i < n; i++) { p.input = inp({ ...extra, shoot: true }); step(m); }
  p.input = inp(extra); step(m);
  p.input = inp();
}
export function pressPass(m: Match, p: Player, hold: number, extra: Partial<InputFrame> = {}): void {
  p.input = inp({ ...extra, pass: hold > 0, passPressed: true }); step(m);
  const n = Math.round(hold / DT);
  for (let i = 0; i < n; i++) { p.input = inp({ ...extra, pass: true }); step(m); }
  p.input = inp(extra); step(m);
  p.input = inp();
}
