import { T } from './tuning';
import { GOAL, PENALTY_X, PITCH, attackDir, goalX } from './field';
import { emit } from './events';
import { KEEPERS } from './tuning';
import type { Match, Pen, Player, Team } from './state';

const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
const other = (t: Team): Team => (t === 0 ? 1 : 0);
/** Seconds of each step of a penalty kick. */
export const PEN = { ready: 1.0, aimAuto: 4.0, aiAimMin: 1.0, aiAimMax: 1.8, fly: 0.55, result: 1.5, reach: 28 } as const;
const SHOOTERS = [3, 4, 1, 2];     // forwards first
const gk = (m: Match, t: Team): Player => m.players.find((p) => p.team === t && p.role === 'gk')!;

/** Where the penalty spot of the goal that `team` attacks is. */
export const spot = (t: Team): { x: number; y: number } => ({ x: t === 0 ? PITCH.w - PENALTY_X : PENALTY_X, y: 80 });

export function startPenalties(m: Match): void {
  const first: Team = other(m.firstKick);
  m.phase = 'penalties'; m.phaseT = 0; m.restart = null; m.special = null; m.flight = null;
  m.pen = { turn: first, first, kicks: [[], []], round: 0, step: 'ready', t: 0, aimY: 80, aim: { zone: 1, y: 80 }, shooter: -1, keeper: -1, outcome: null, shotY: 80, diveY: 80, winner: null, seed: 0 };
  Object.assign(m.ball, { state: 'scripted', owner: null, vx: 0, vy: 0, vz: 0, z: 0, inNet: false, scored: null });
  setupKick(m);
  emit(m, 'whistle', m.ball.x, m.ball.y, 0, undefined, 1);
  emit(m, 'penstart', m.ball.x, m.ball.y);
}

/** Who has kicked, how many scored and how many kicks each still has inside the first three. */
export function tally(pen: Pen): { goals: [number, number]; taken: [number, number] } {
  return { goals: [pen.kicks[0].filter((k) => k === 1).length, pen.kicks[1].filter((k) => k === 1).length], taken: [pen.kicks[0].length, pen.kicks[1].length] };
}

/** Is the shootout decided? After 3 kicks each a team that cannot be caught has won; after that every round of two decides it. */
export function decided(pen: Pen): Team | null {
  const { goals, taken } = tally(pen);
  for (const t of [0, 1] as Team[]) {
    const o = other(t);
    if (taken[0] <= 3 && taken[1] <= 3) {
      const left = (x: Team): number => 3 - taken[x];
      if (goals[t] > goals[o] + left(o)) return t;
    } else if (taken[0] === taken[1] && goals[t] > goals[o]) return t;
  }
  return null;
}

function setupKick(m: Match): void {
  const pen = m.pen!, t = pen.turn, o = other(t), dir = attackDir(t), sp = spot(t);
  const list = m.players.filter((p) => p.team === t && p.role !== 'gk').sort((a, b) => SHOOTERS.indexOf(a.slot) - SHOOTERS.indexOf(b.slot));
  const shooter = list[pen.kicks[t].length % list.length], keeper = gk(m, o);
  pen.shooter = shooter.id; pen.keeper = keeper.id; pen.step = 'ready'; pen.t = 0; pen.outcome = null; pen.aimY = 80; pen.aim = { zone: 1, y: 80 };
  for (const p of m.players) { p.act = null; p.state = 'idle'; p.vx = p.vy = p.vz = 0; p.z = 0; }
  // the others wait at the half line, in two rows, so the camera does not show them
  let i = 0;
  for (const p of m.players) { if (p.id === shooter.id || p.id === keeper.id) continue; p.x = PITCH.w / 2 + (p.team === 0 ? -1 : 1) * (20 + (i % 4) * 14); p.y = 40 + (i % 2) * 80; p.facing = attackDir(p.team); i++; }
  shooter.x = sp.x - dir * 16; shooter.y = sp.y; shooter.facing = dir; shooter.dirX = dir; shooter.dirY = 0;
  keeper.x = goalX(t) - dir * 4; keeper.y = 80; keeper.facing = -dir as 1 | -1; keeper.dirX = -dir; keeper.dirY = 0;
  Object.assign(m.ball, { x: sp.x, y: sp.y, z: 0, vx: 0, vy: 0, vz: 0, state: 'scripted', owner: null, inNet: false, scored: null });
}

/** Rolls the result of the kick the moment it leaves the foot (the view only shows it). */
function resolveKick(m: Match, shotY: number, err: number): void {
  const pen = m.pen!, shooter = m.players.find((p) => p.id === pen.shooter)!, keeper = m.players.find((p) => p.id === pen.keeper)!;
  const K = KEEPERS.thor, skillOf = (p: Player): number => (p.stats.keeper ? p.stats.keeper.skill : K.skill);
  const y = shotY + m.rng.range(-err, err);
  pen.shotY = y;
  const half = (GOAL.y1 - GOAL.y0) / 2;
  const off = Math.abs(y - 80) - half;                                  // beyond the posts
  const zone = (v: number): number => (v < 80 - half / 3 ? 0 : v > 80 + half / 3 ? 2 : 1);
  // the keeper guesses a side: the sides more often than the middle
  const r = m.rng.next(), dz = r < 0.4 ? 0 : r < 0.8 ? 2 : 1;
  pen.diveY = dz === 0 ? 80 - half * 0.7 : dz === 2 ? 80 + half * 0.7 : 80;
  const skill = skillOf(keeper) * (m.difficulty === 'tranquilos' && keeper.team === 1 ? 0.8 : m.difficulty === 'campeones' && keeper.team === 1 ? 1.1 : 1);
  if (off > 0) pen.outcome = off < 3 ? 'post' : 'miss';
  else if (Math.abs(Math.abs(y - 80) - half) < 2.5) pen.outcome = 'post';
  else if (dz === zone(y)) pen.outcome = m.rng.chance(clamp(skill * (dz === 1 ? 0.95 : 0.62), 0, 0.95)) ? 'saved' : 'goal';
  else pen.outcome = m.rng.chance(0.12 * skill) ? 'saved' : 'goal';
  void shooter;
}

/** One step of the shootout. */
export function stepPenalties(m: Match, dt: number): void {
  const pen = m.pen;
  if (!pen) { m.phase = 'over'; return; }
  pen.t += dt;
  const shooter = m.players.find((p) => p.id === pen.shooter)!, keeper = m.players.find((p) => p.id === pen.keeper)!, t = pen.turn, dir = attackDir(t), sp = spot(t);
  const human = m.humans.find((h) => m.players.find((p) => p.id === h.id)?.team === t) ?? m.humans.find((h) => h.team === t);
  if (pen.step === 'ready') {
    if (pen.t >= PEN.ready) { pen.step = 'aim'; pen.t = 0; pen.aiAt = m.rng.range(PEN.aiAimMin, PEN.aiAimMax); pen.aiY = 80 + (m.rng.chance(0.5) ? -1 : 1) * m.rng.range(8, 22); }
  } else if (pen.step === 'aim') {
    let fire = false;
    if (human) {
      const f = m.hin[human.slot];
      // the stick points at the goal: up and down on the screen is along the goal line. Past 86 percent of the stick the ball goes wide;
      // easy controls never miss the goal
      const my = f ? f.my : 0, reach = human.controls === 'easy' ? 22 : 28;
      pen.aimY += (80 + clamp(my, -1, 1) * reach - pen.aimY) * Math.min(1, 10 * dt);
      fire = !!f && (f.shootPressed || f.passPressed);
      if (pen.t >= PEN.aimAuto) fire = true;
    } else { pen.aimY = pen.aimY + (pen.aiY! - pen.aimY) * Math.min(1, 6 * dt); if (pen.t >= pen.aiAt!) fire = true; }
    if (fire) {
      const err = human ? (human.controls === 'easy' ? 2 : 4) : (t === 1 ? ({ tranquilos: 9, normales: 5, campeones: 3 }[m.difficulty]) : 6);
      resolveKick(m, pen.aimY, err);
      pen.step = 'fly'; pen.t = 0;
      shooter.act = { kind: 'kick', t: 0, dur: 0.35, contact: 0.1, sub: 'shot' }; shooter.state = 'kick';
      keeper.act = { kind: 'dive', t: 0, dur: 0.6, dy: pen.diveY }; keeper.state = 'dive';
      emit(m, 'kick', sp.x, sp.y, 0, shooter.id, 450);
    }
  } else if (pen.step === 'fly') {
    const u = Math.min(1, pen.t / PEN.fly), b = m.ball;
    if (shooter.act) shooter.act.t = pen.t;
    if (keeper.act) { keeper.act.t = pen.t; keeper.y += (pen.diveY - keeper.y) * Math.min(1, 7 * dt); }
    const endX = goalX(t) + dir * (pen.outcome === 'goal' ? 10 : pen.outcome === 'miss' ? 22 : 0);
    const stopX = pen.outcome === 'saved' ? goalX(t) - dir * 6 : endX;
    const ty = pen.outcome === 'saved' ? pen.diveY + (pen.shotY - pen.diveY) * 0.3 : pen.shotY;
    b.x = sp.x + (stopX - sp.x) * u; b.y = sp.y + (ty - sp.y) * u; b.z = pen.outcome === 'miss' ? 10 + 22 * u : 6 + 4 * Math.sin(Math.PI * u);
    b.roll += 700 * dt;
    if (u >= 1) {
      pen.step = 'result'; pen.t = 0;
      const goal = pen.outcome === 'goal';
      pen.kicks[t].push(goal ? 1 : 0);
      if (goal) { b.inNet = true; b.z = 6; m.stats.goals[t]++; shooter.stats2.goals++; emit(m, 'goal', b.x, b.y, b.z, shooter.id, t); emit(m, 'pengoal', b.x, b.y); shooter.state = 'celebrate'; keeper.state = 'sad'; keeper.act = null; }
      else if (pen.outcome === 'saved') { keeper.stats2.saves++; m.stats.saves[keeper.team]++; emit(m, 'save', b.x, b.y, 0, keeper.id, 1); emit(m, 'pensave', b.x, b.y); keeper.state = 'celebrate'; keeper.act = null; shooter.state = 'sad'; shooter.act = null; }
      else { emit(m, pen.outcome === 'post' ? 'post' : 'bounce', b.x, b.y, b.z, undefined, 200); emit(m, 'penmiss', b.x, b.y); shooter.state = 'sad'; shooter.act = null; keeper.state = 'idle'; keeper.act = null; }
      pen.winner = decided(pen);
    }
  } else {
    if (pen.t >= PEN.result) {
      if (pen.winner !== null) { m.penWinner = pen.winner; m.phase = 'over'; m.phaseT = 0; emit(m, 'whistle', m.ball.x, m.ball.y, 0, undefined, 3); emit(m, 'final', m.ball.x, m.ball.y); return; }
      pen.turn = other(pen.turn); pen.round++;
      m.ball.inNet = false;
      setupKick(m);
    }
  }
}
