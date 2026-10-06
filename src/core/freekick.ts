import { T } from './tuning';
import { GOAL, PITCH, attackDir, goalX } from './field';
import { emit } from './events';
import { placeCones } from './rules';
import { curveDrift, freeKickShot } from './actions';
import type { Match, Player, Restart, Team } from './state';

const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
const sgn = (v: number): number => (v < 0 ? -1 : 1);

/** The meter of the free kick: after the first Tiro it swings up and down once in `sweep` seconds (0 while the taker is still aiming). The kick is best when it is pressed at the top. */
export function fkMeter(fk: { stage: 'aim' | 'meter'; mt: number }, t: number): number {
  if (fk.stage !== 'meter') return 0;
  const x = (t - fk.mt) / T.free.sweep;
  return x <= 0 ? 0 : x >= 1 ? 0 : x < 0.5 ? 2 * x : 2 - 2 * x;
}
/** Has the meter finished its swing without a press? Then the taker goes back to aiming (nothing is lost). */
export const fkSwingOver = (fk: { stage: 'aim' | 'meter'; mt: number }, t: number): boolean => fk.stage === 'meter' && t - fk.mt >= T.free.sweep;
/** What the meter says about a press: 1 is the top (¡AHORA!), 0.5 is fair, 0 is bad. */
export const fkTiming = (u: number): number => (u >= T.free.sweet ? 1 : u >= T.free.ok ? 0.5 : 0);

/** The effect of a free kick: the ball starts away from the wall and bends into the aimed point, so it goes to the side where the aim is. */
export const fkSpin = (aimY: number, curve: number): number => (aimY < PITCH.d / 2 ? 1 : -1) * curve * T.free.spin;
/** Where the ball starts to go and how far it bends, for the preview the player sees. */
export function fkPath(m: Match, r: Restart): { gx: number; ty: number; start: number; drift: number } {
  const fk = r.fk!, gx = goalX(r.team), d = Math.hypot(gx - r.x, fk.aimY - r.y), drift = curveDrift(fkSpin(fk.aimY, fk.curve), d, (T.free.vMin + T.free.vMax) / 2);
  void m;
  return { gx, ty: fk.aimY, start: fk.aimY - drift, drift };
}

/** The ball is dead at the spot of a foul and the family or the rivals take a free kick: a wall of two stands in front, the keeper stays on his line. */
export function startFreeKick(m: Match, team: Team, x: number, y: number, fouled = -1): void {
  const dir = attackDir(team), gx = goalX(team);
  const sx = gx - dir * clamp(Math.abs(gx - x), T.free.minDist, T.free.maxDist), sy = clamp(y, 16, PITCH.d - 16);
  const near = (p: Player): number => Math.hypot(p.x - sx, p.y - sy);
  const takers = m.players.filter((p) => p.team === team && p.role !== 'gk' && p.id !== fouled).sort((a, b) => near(a) - near(b));
  const taker = takers[0] ?? m.players.find((p) => p.team === team && p.role !== 'gk')!;
  const wallers = m.players.filter((p) => p.team !== team && p.role !== 'gk').sort((a, b) => near(a) - near(b)).slice(0, T.free.wall);
  // the wall on the line from the ball to the middle of the goal
  const ux = (gx - sx) / Math.hypot(gx - sx, PITCH.d / 2 - sy), uy = (PITCH.d / 2 - sy) / Math.hypot(gx - sx, PITCH.d / 2 - sy);
  const wx = sx + ux * T.free.wallDist, wy = sy + uy * T.free.wallDist;
  wallers.forEach((p, i) => {
    p.x = wx; p.y = clamp(wy + (i - (wallers.length - 1) / 2) * T.free.wallGap, 8, PITCH.d - 8); p.vx = p.vy = p.vz = 0; p.z = 0;
    p.state = 'idle'; p.act = null; p.facing = (-dir) as 1 | -1; p.dirX = p.facing; p.dirY = 0;
  });
  // the one who was fouled gets up beside the ball, out of the way of the kick
  const victim = m.players.find((p) => p.id === fouled);
  if (victim) { victim.x = sx - dir * 14; victim.y = clamp(sy + (sy < PITCH.d / 2 ? 26 : -26), 10, PITCH.d - 10); victim.vx = victim.vy = 0; victim.noControlT = 1.5; }
  m.restart = {
    kind: 'freekick', team, x: sx, y: sy, taker: taker.id, t: 0, kicked: false, aiAt: m.rng.range(T.free.aiMin, T.free.aiMax),
    fk: { aimY: PITCH.d / 2, curve: 0.5, wall: wallers.map((p) => p.id), fouled, stage: 'aim', mt: 0 },
  };
  m.phase = 'restart'; m.phaseT = 0;
  Object.assign(m.ball, { x: sx, y: sy, z: 0, vx: 0, vy: 0, vz: 0, spin: 0, state: 'dead', owner: null, inNet: false });
  m.data.fkAt = m.t; m.data.fkTaken = ((m.data.fkTaken as number) ?? 0);
  emit(m, 'whistle', sx, sy, 0, undefined, 1);
  emit(m, 'freekick', sx, sy, 0, taker.id, team);
}

/** While the taker waits: the stick moves the aim along the goal (up and down) and the effect (towards the goal more, away from it less). The wall does not move. */
export function stepFreeKick(m: Match, r: Restart, dt: number): void {
  const fk = r.fk!, t = m.players.find((p) => p.id === r.taker)!;
  for (const id of fk.wall) { const w = m.players.find((p) => p.id === id); if (w) { w.vx = w.vy = 0; w.state = 'idle'; } }
  if (t.control !== 'human' || r.t < T.restart.position) return;
  const f = t.input, dir = attackDir(r.team);
  fk.aimY = clamp(fk.aimY + f.my * T.free.aimV * dt, GOAL.y0 - 10, GOAL.y1 + 10);
  fk.curve = clamp(fk.curve + f.mx * dir * T.free.curveV * dt, 0, 1);
}

/** The speed and the lift that take the ball over the wall (it passes the wall at `zWall` high) and bring it down inside the goal at `zg` high. A bad timing stays under the wall. */
function lift(d: number, zg: number): { v: number; vz: number } {
  const dw = T.free.wallDist - T.free.wallReach, r = Math.max(1.5, d / dw), half = T.gravity / 2;
  const tw0 = Math.sqrt(Math.max(0.004, (T.free.zWall * r - zg) / (half * r * (r - 1))));
  const v = clamp(dw / tw0, T.free.vMin, T.free.vMax), tw = dw / v;
  return { v, vz: (T.free.zWall + half * tw * tw) / tw };
}

/** The kick. A person gets the timing of the meter, the AI a corner of the goal and an effect with the error of its player. */
export function takeFreeKick(m: Match, r: Restart, t: Player): void {
  const fk = r.fk!, human = t.control === 'human', easy = human && t.controls === 'easy';
  let aimY = fk.aimY, curve = fk.curve, err: number, q: number, timing: number;
  if (human) {
    timing = easy ? 1 : fk.stage === 'meter' ? fkTiming(fkMeter(fk, r.t)) : 0.5;   // a kick without the meter (the time ran out) is a fair one
    err = T.free.err * (timing === 1 ? 0.5 : timing === 0.5 ? 1 : 2.2); q = T.free.q[timing * 2];
    if (easy) curve = Math.min(curve, 0.7);
  } else {
    aimY = PITCH.d / 2 + sgn(m.rng.range(-1, 1)) * m.rng.range(10, 20); curve = m.rng.range(0.35, 0.9);
    const roll = m.rng.range(0, 1);
    timing = roll < T.free.aiBad ? 0 : roll < T.free.aiBad + T.free.aiSweet ? 1 : 0.5;
    err = Math.max(T.free.aiErrMin, t.aiErr * T.free.aiErrK); q = T.free.q[timing * 2] * T.free.aiQ;
  }
  const d = Math.abs(goalX(r.team) - r.x), zg = timing === 1 ? T.free.zGoal[0] : T.free.zGoal[1];
  const { v, vz } = timing === 0 ? { v: T.free.vMin + 40, vz: 90 } : lift(d, zg);   // a bad timing: low, into the wall
  m.data.fkTaken = ((m.data.fkTaken as number) ?? 0) + 1; m.data.fkTeam = r.team; m.data.fkKickAt = m.t;   // a goal counts when it comes from THIS kick, however long the aiming took
  freeKickShot(m, t, { ty: aimY, speed: v, vz, err, spin: fkSpin(aimY, curve), q });
  m.data.fkTiming = timing;
}

/** Practice with Thor: the family takes a free kick from the right, 190 px from the goal, and the cones of the rivals make the wall. Each try moves the ball to another place. */
export function startTrainingFreeKick(m: Match): void {
  placeCones(m);
  const n = ((m.data.fkTries as number) ?? 0); m.data.fkTries = n + 1;
  const ys = [80, 50, 110, 38, 122];
  startFreeKick(m, 0, PITCH.w - 190, ys[n % ys.length], -1);
}
