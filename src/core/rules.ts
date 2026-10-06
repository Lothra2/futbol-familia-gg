import { T } from './tuning';
import { CENTER, ESCAPE, GOAL, PITCH, attackDir, goalX, ownGoalX, slotPos } from './field';
import { emit } from './events';
import { addBar, stepCinematic } from './specials';
import { startPenalties } from './penalties';
import { fkSwingOver, startFreeKick, stepFreeKick, takeFreeKick } from './freekick';
import { choosePass, playerById, restartKick } from './actions';
import { emptyInput } from './types';
import type { Match, Player, Restart, RestartKind, Team } from './state';

const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
const other = (t: Team): Team => (t === 0 ? 1 : 0);
export const isHuman = (p: Player): boolean => p.control === 'human';

/** Phases where the ball is not in play but the players still move. */
export const movesIn = (m: Match): boolean => m.phase === 'play' || m.phase === 'restart' || m.phase === 'kickoff';

function resetPlayers(m: Match): void {
  for (const p of m.players) {
    const s = slotPos(p.team, p.slot);
    p.x = s.x; p.y = s.y; p.z = 0; p.vx = p.vy = p.vz = 0; p.state = 'idle'; p.act = null; p.dirX = attackDir(p.team); p.dirY = 0; p.facing = attackDir(p.team);
    p.shoot.down = false; p.pass.down = false; p.cd = { slide: 0, steal: 0, bump: 0 }; p.holdT = 0;
  }
}

/** Practice with Thor: the rival field players are cones scattered in their half. */
export function placeCones(m: Match): void {
  const spots: [number, number][] = [[690, 40], [740, 120], [800, 70], [850, 125]];
  let i = 0;
  for (const p of m.players) if (p.team === 1 && p.role !== 'gk') { p.x = spots[i % 4][0]; p.y = spots[i % 4][1]; p.vx = p.vy = 0; i++; }
}

export function setupKickoff(m: Match, team: Team): void {
  if (m.training) team = 0;   // practice: the family always kicks off
  resetPlayers(m);
  if (m.training) placeCones(m);
  const taker = m.players.find((p) => p.team === team && p.slot === 4)!;
  taker.x = CENTER.x - attackDir(team) * 6; taker.y = CENTER.y;
  const b = m.ball;
  Object.assign(b, { x: CENTER.x, y: CENTER.y, z: 0, vx: 0, vy: 0, vz: 0, spin: 0, state: 'dead', owner: null, inNet: false, scored: null });
  m.restart = { kind: 'kickoff', team, x: CENTER.x, y: CENTER.y, taker: taker.id, t: 0, kicked: false, aiAt: m.rng.range(T.restart.aiMin, T.restart.aiMax) };
  m.phase = 'kickoff'; m.phaseT = 0;
  emit(m, 'whistle', CENTER.x, CENTER.y, 0, undefined, 1);
  emit(m, 'wipe', CENTER.x, CENTER.y);
}

function nearestTo(m: Match, team: Team, x: number, y: number, field: boolean, except = -1): Player {
  let best: Player | null = null, bd = Infinity;
  for (const p of m.players) {
    if (p.team !== team || (field && p.role === 'gk') || p.id === except) continue;
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < bd) { bd = d; best = p; }
  }
  return best!;
}

function startRestart(m: Match, kind: RestartKind, team: Team, x: number, y: number): void {
  const taker = kind === 'goalkick' ? m.players.find((p) => p.team === team && p.role === 'gk')! : nearestTo(m, team, x, y, true);
  m.restart = { kind, team, x, y, taker: taker.id, t: 0, kicked: false, aiAt: m.rng.range(T.restart.aiMin, T.restart.aiMax) };
  m.phase = 'restart'; m.phaseT = 0;
  const b = m.ball;
  Object.assign(b, { x, y, z: 0, vx: 0, vy: 0, vz: 0, spin: 0, state: 'dead', owner: null, inNet: false });
  emit(m, 'whistle', x, y, 0, undefined, 1);
  emit(m, kind, x, y, 0, taker.id, team);
}

/** The ball left the pitch. The type of restart depends on the line and on who touched it last. */
function ballOut(m: Match, prevX: number, prevY: number): void {
  const b = m.ball;
  const crossedX = prevX >= 0 && prevX <= PITCH.w && (b.x < 0 || b.x > PITCH.w);
  const lastTeam: Team = b.lastTouch.team ?? 0;
  if (crossedX || (b.x < 0 || b.x > PITCH.w)) {
    const atRight = b.x > PITCH.w;
    const attacker: Team = atRight ? 0 : 1;
    if (m.training && !atRight) { startRestart(m, 'goalkick', 0, 32, 80); return; }   // the cones never take a corner
    if (lastTeam === attacker) {
      const defender = other(attacker);
      startRestart(m, 'goalkick', defender, defender === 0 ? 32 : PITCH.w - 32, 80);
    } else {
      startRestart(m, 'corner', attacker, atRight ? PITCH.w - 4 : 4, b.y < 80 ? 4 : PITCH.d - 4);
    }
  } else {
    startRestart(m, 'throwin', m.training ? 0 : other(lastTeam), clamp(b.x, 8, PITCH.w - 8), b.y < 0 ? 0 : PITCH.d);
  }
}

/** A ball flying at one of the goals, about to arrive in less than a second: the half waits for it. */
export function shotIncoming(m: Match): boolean {
  const b = m.ball;
  if (b.state !== 'free' || Math.abs(b.vx) < 180) return false;
  const gx = b.vx > 0 ? PITCH.w : 0, t = (gx - b.x) / b.vx;
  if (t <= 0 || t > 1.0) return false;
  const y = b.y + b.vy * t;
  return y > GOAL.y0 - 10 && y < GOAL.y1 + 10;
}

function endHalf(m: Match): void {
  const b = m.ball;
  Object.assign(b, { state: 'dead', owner: null, vx: 0, vy: 0, vz: 0 });
  if (m.half === 1) { m.phase = 'halftime'; m.phaseT = 0; emit(m, 'whistle', b.x, b.y, 0, undefined, 2); }
  else if (!m.training && m.score[0] === m.score[1]) {
    // a tie goes to penalties. The Cup plays 60 s of golden goal first and, if nobody scores, penalties; every other match goes straight to the shootout
    if (!m.knockout || m.golden) startPenalties(m);
    else { m.golden = true; m.halfLength = T.goldenT; m.clock = 0; m.graceT = 0; emit(m, 'golden', b.x, b.y); setupKickoff(m, other(m.firstKick)); }
  } else { m.phase = 'over'; m.phaseT = 0; emit(m, 'whistle', b.x, b.y, 0, undefined, 3); emit(m, 'final', b.x, b.y); }
}

function goalScored(m: Match, team: Team): void {
  const b = m.ball;
  m.score[team]++; m.stats.goals[team]++;
  const last = playerById(m, b.lastTouch.player);
  const scorer = last ? last.id : null;
  let assist: number | null = null;
  const pt = b.prevTouch;
  if (last && last.team === team && pt.team === team && pt.player !== null && pt.player !== last.id && m.t - pt.t < 4) assist = pt.player;
  m.lastGoal = { team, scorer: last && last.team === team ? scorer : null, assist };
  if (m.data.fkTeam === team && m.t - ((m.data.fkKickAt as number) ?? -99) < 5) m.data.fkGoals = ((m.data.fkGoals as number) ?? 0) + 1;   // a goal from a free kick (practice reads it)
  if (last && last.team === team) last.stats2.goals++;
  const a = playerById(m, assist); if (a) a.stats2.assists++;
  addBar(m, other(team), T.bar.conceded);
  m.phase = 'goal'; m.phaseT = 0;
  emit(m, 'goal', b.x, b.y, b.z, scorer ?? undefined, team);
  for (const p of m.players) { p.state = p.team === team ? 'celebrate' : 'sad'; p.act = null; p.vx = p.vy = 0; }
}

/** The kick that puts the ball back in play (GAME_DESIGN section 5). */
function doRestartKick(m: Match, r: Restart): void {
  const t = playerById(m, r.taker)!, b = m.ball, inp = t.input;
  const dir = attackDir(r.team);
  if (r.kind === 'kickoff') {
    const c = choosePass(m, t, inp.mx, inp.my, 200) ?? (() => { const q = nearestTo(m, t.team, t.x, t.y, true); const mate = m.players.filter((o) => o.team === t.team && o.role !== 'gk' && o.id !== t.id)[0] ?? q; return { id: mate.id, x: mate.x, y: mate.y }; })();
    m.lastPass = { from: t.id, to: c.id, t: m.t, team: t.team };
    restartKick(m, t, c.x, c.y, false);
  } else if (r.kind === 'throwin') {
    // the throw always goes to a teammate, the closest one when nobody is where the stick points, and lands inside the pitch
    let c = choosePass(m, t, inp.mx, inp.my, T.throwMax) ?? choosePass(m, t, 0, 0, T.throwMax);
    if (!c) {
      const q = nearestTo(m, t.team, t.x, t.y, true, t.id);
      c = { id: q.id, x: q.x, y: q.y };
    }
    const dx = c.x - b.x, dy = c.y - b.y, d = Math.hypot(dx, dy) || 1, k = Math.min(1, T.throwMax / d);
    const tx = clamp(b.x + dx * k, 14, PITCH.w - 14), ty = clamp(b.y + dy * k, T.throwInset, PITCH.d - T.throwInset);
    b.z = 18;
    m.lastPass = { from: t.id, to: c.id, t: m.t, team: t.team };
    restartKick(m, t, tx, ty, true);
  } else if (r.kind === 'goalkick') {
    const c = choosePass(m, t, inp.mx, inp.my, T.lobMaxD);
    if (c) { m.lastPass = { from: t.id, to: c.id, t: m.t, team: t.team }; restartKick(m, t, c.x, c.y, true); }
    else restartKick(m, t, b.x + dir * 200, clamp(m.rng.range(40, 120), 8, PITCH.d - 8), true);
  } else if (r.kind === 'freekick') {
    takeFreeKick(m, r, t);
    t.input = { ...t.input, shoot: false, pass: false, shootPressed: false, passPressed: false };   // the press that took the kick must not also start a slide in the same step
  } else {
    const gx = goalX(r.team);
    restartKick(m, t, gx - dir * T.cornerBox, 80 + m.rng.range(-14, 14), true);
  }
  r.kicked = true; m.restart = null; m.phase = 'play'; m.phaseT = 0;
}

/** Waits for the taker (a human presses, the AI waits its turn, everybody times out) and puts the ball back in play. */
function stepRestart(m: Match, dt: number): void {
  const r = m.restart;
  if (!r) { m.phase = 'play'; return; }
  const t = playerById(m, r.taker)!;
  r.t += dt;
  if (r.t <= dt && r.kind !== 'kickoff') {
    const d = Math.hypot(t.x - r.x, t.y - r.y);
    if (d > T.restart.teleport) emit(m, 'zas', r.x, r.y, 0, t.id);
    t.x = r.kind === 'freekick' ? r.x - attackDir(r.team) * 9 : r.x; t.y = r.y; t.vx = t.vy = 0;
    t.facing = attackDir(r.team); t.dirX = t.facing; t.dirY = 0;
  }
  t.vx = 0; t.vy = 0;
  if (r.kind === 'freekick') stepFreeKick(m, r, dt);
  if (r.t < T.restart.position && r.kind !== 'kickoff') return;
  if (r.kind === 'kickoff' && r.t < T.restart.wipe) return;
  let go = false;
  const easy = isHuman(t) && t.controls === 'easy';
  if (isHuman(t) && r.kind === 'freekick') {
    // aim without a hurry, the first Tiro starts the meter, the second one kicks (easy controls: one Tiro). No time limit in practice
    const fk = r.fk!, press = t.input.shootPressed || t.input.passPressed;
    if (easy) go = press;
    else if (fk.stage === 'aim') { if (press) { fk.stage = 'meter'; fk.mt = r.t; } }
    else if (press) go = true;
    else if (fkSwingOver(fk, r.t)) fk.stage = 'aim';
    if (!m.training && r.t >= T.free.auto) go = true;
  } else if (isHuman(t)) {
    go = t.input.shootPressed || t.input.passPressed;
    const auto = r.kind === 'kickoff' ? (easy ? T.restart.easyKickoffAuto : T.restart.kickoffAuto) : (easy ? T.restart.easyAuto : T.restart.humanAuto);
    if (r.t >= auto) go = true;
  } else go = r.t >= r.aiAt + (r.kind === 'kickoff' ? T.restart.wipe : 0);
  if (go) doRestartKick(m, r);
}

/** Phase machine of the match. Called every step before the players move. */
export function preStep(m: Match, dt: number): void {
  if (m.phase === 'kickoff' || m.phase === 'restart') stepRestart(m, dt);
  else if (m.phase === 'cinematic') stepCinematic(m, dt);
  else if (m.phase === 'goal') {
    const skip = m.phaseT >= T.goalSkip && m.hin.some((f) => !!f && (f.shootPressed || f.passPressed || f.specialPressed));
    if (m.phaseT >= T.goalT || skip) { if (m.golden) { m.phase = 'over'; m.phaseT = 0; emit(m, 'whistle', m.ball.x, m.ball.y, 0, undefined, 3); emit(m, 'final', m.ball.x, m.ball.y); } else setupKickoff(m, other(m.lastGoal!.team)); }
  } else if (m.phase === 'halftime') {
    if (m.phaseT >= T.halftimeT) { m.half = 2; m.clock = 0; m.graceT = 0; setupKickoff(m, other(m.firstKick)); }
  }
}

/** Goals, the ball leaving the pitch and the clock. Called every step after the ball moved. */
export function postStep(m: Match, dt: number, prevX: number, prevY: number): void {
  const b = m.ball;
  if (m.phase !== 'play') { m.data.foul = undefined; return; }
  if (b.inNet && b.scored !== null) { const team = b.scored; b.scored = null; goalScored(m, team); return; }
  const foul = m.data.foul as { team: Team; x: number; y: number; who: number } | undefined;
  if (foul) { m.data.foul = undefined; if (m.clock < m.halfLength) { startFreeKick(m, foul.team, foul.x, foul.y, foul.who); return; } }
  if (!b.inNet && b.state !== 'dead' && b.state !== 'scripted' && (b.x < 0 || b.x > PITCH.w || b.y < 0 || b.y > PITCH.d)) {
    if (m.clock >= m.halfLength) { endHalf(m); return; }
    ballOut(m, prevX, prevY); return;
  }
  m.clock += dt;
  if (m.clock >= m.halfLength) {
    m.clock = m.halfLength;
    if (shotIncoming(m) && m.graceT < T.endGrace) m.graceT += dt;
    else endHalf(m);
  }
}

void ESCAPE; void ownGoalX; void emptyInput;
