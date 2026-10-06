import { DIFFICULTY, T } from '../tuning';
import { ownGoalX } from '../field';
import { choosePass, restartKick, setTouch, startDive } from '../actions';
import { emit } from '../events';
import { emptyInput, type InputFrame } from '../types';
import { crossing } from './predict';
import { rubber } from './difficulty';
import type { Match, Player } from '../state';

const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

/** Easy controls only: if the family has not scored by 70 % of the match, the next shot at goal slips past the keeper. Once per match. */
export function invisibleHelp(m: Match, shooterTeam: number | null): boolean {
  if (shooterTeam !== 0 || m.data.helpUsed || m.score[0] > 0) return false;
  if (!m.players.some((q) => q.team === 0 && q.control === 'human' && q.controls === 'easy')) return false;
  const played = (m.half === 1 ? 0 : m.halfLength) + m.clock;
  return played >= T.easy.helpAt * 2 * m.halfLength;
}

export interface KeeperParams { reaction: number; reach: number; skill: number }
/** Reaction, reach and skill of a keeper. The rival keepers follow the difficulty and the rubber band (GAME_DESIGN sections 6.7 and 9). */
export function keeperParams(m: Match, p: Player): KeeperParams {
  const k = p.stats.keeper!;
  if (p.team !== 1) return { ...k };
  const d = DIFFICULTY[m.difficulty], r = m.score[0] - m.score[1] <= -2 ? 0.9 : 1;
  return { reaction: Math.max(0.08, k.reaction + d.keeperReact), reach: k.reach, skill: Math.min(0.95, k.skill * d.keeperSkill * r) };
}

/** Probability that a keeper stops a shot that reaches him (GAME_DESIGN 6.7). `travel` is how far he had to move from where he stood when the shot left. */
export function saveChance(k: KeeperParams, speed: number, z: number, travel: number): number {
  const fast = 1 - clamp((speed - T.gk.speedPen) / T.gk.speedPenSpan, 0, 0.5);
  const far = 1 - Math.min(1, Math.max(0, travel - T.gk.farFree) / k.reach);
  return Math.min(0.95, k.skill * fast * (z > 22 ? T.gk.highPen : 1) * far);
}

function catchBall(m: Match, p: Player): void {
  const b = m.ball;
  b.state = 'held'; b.owner = p.id; b.vx = b.vy = b.vz = 0; b.spin = 0; b.inNet = false;
  p.act = null; p.state = 'hold'; p.immuneT = 99; p.holdT = 0; p.ai.armedAt = 0; p.vx = p.vy = 0;
  setTouch(m, p);
  p.stats2.saves++; m.stats.saves[p.team]++;
  emit(m, 'save', b.x, b.y, b.z, p.id, 1);
}

function punchBall(m: Match, p: Player, inward: 1 | -1): void {
  const b = m.ball;
  b.state = 'free'; b.owner = null;
  b.vx = inward * T.gk.punch.vx; b.vy = m.rng.range(-T.gk.punch.vy, T.gk.punch.vy); b.vz = T.gk.punch.vz; b.spin = 0;
  p.noControlT = 0.3; setTouch(m, p);
  p.stats2.saves++; m.stats.saves[p.team]++;
  emit(m, 'save', b.x, b.y, b.z, p.id, 0);
}

/** The keeper lets the ball go: to the controlled player if a human asks for it, else to a free teammate, else a long kick. */
export function throwFromKeeper(m: Match, p: Player, to: Player | null): void {
  const inward = (p.team === 0 ? 1 : -1) as 1 | -1;
  let tx: number, ty: number, id = -1;
  if (to) { tx = to.x + to.vx * 0.3; ty = to.y + to.vy * 0.3; id = to.id; }
  else {
    const c = choosePass(m, p, 0, 0, 200);
    if (c) { tx = c.x; ty = c.y; id = c.id; } else { tx = p.x + inward * 220; ty = 80 + m.rng.range(-30, 30); }
  }
  p.immuneT = 0; p.state = 'idle'; p.ai.armedAt = 0; p.holdT = 0;
  if (id >= 0) m.lastPass = { from: p.id, to: id, t: m.t, team: p.team };
  restartKick(m, p, tx, ty, Math.hypot(tx - p.x, ty - p.y) > 130);
}

/** The moment the shot reaches the keeper: roll once whether he stops it (catch if it is slow, punch if it is fast). */
function tryRoll(m: Match, p: Player, K: KeeperParams, inward: 1 | -1): void {
  const b = m.ball, A = p.ai;
  if (A.rolled || !A.threat) return;
  if (!(Math.abs(b.x - p.x) <= T.gk.contact && Math.abs(b.y - p.y) <= K.reach + 4 && Math.abs(b.z - 8) <= T.gk.zReach && b.vx * inward < 0)) return;
  A.rolled = true;
  const speed = Math.hypot(b.vx, b.vy);
  m.data.rolls = ((m.data.rolls as number) ?? 0) + 1;
  if (invisibleHelp(m, b.lastTouch.team)) { m.data.helpUsed = true; emit(m, 'help', b.x, b.y, 0, p.id); return; }
  if (m.rng.chance(saveChance(K, speed, b.z, Math.abs(b.y - A.diveT)))) { if (speed < T.gk.catchV) catchBall(m, p); else punchBall(m, p, inward); }
}

/** The whole behaviour of a goalkeeper (always AI): position, read the shot, react, dive, catch or punch, and throw the ball back. */
export function keeperThink(m: Match, p: Player): InputFrame {
  const f = emptyInput(), b = m.ball, A = p.ai;
  const x0 = ownGoalX(p.team), inward = (p.team === 0 ? 1 : -1) as 1 | -1, K = keeperParams(m, p);
  if (p.act) { if (p.act.kind === 'dive') tryRoll(m, p, K, inward); return f; }   // while he dives the shot can still reach him
  const go = (x: number, y: number): void => { const dx = x - p.x, dy = y - p.y, d = Math.hypot(dx, dy); if (d > 2.5) { f.mx = dx / d; f.my = dy / d; } };

  if (b.state === 'held' && b.owner === p.id) {
    if (A.armedAt === 0) A.armedAt = m.t + m.rng.range(T.gk.holdMin, T.gk.holdMax);
    const asked = m.humans.find((h) => h.team === p.team && m.hin[h.slot]?.passPressed);
    if (asked) throwFromKeeper(m, p, m.players.find((q) => q.id === asked.id) ?? null);
    else if (m.t >= A.armedAt) throwFromKeeper(m, p, null);
    return f;
  }
  if (b.owner === p.id) { go(x0 + inward * 24, p.y); if (p.holdT > 0.6) f.passPressed = true; return f; }

  const fast = b.state === 'free' && Math.hypot(b.vx, b.vy) > 100 && b.vx * inward < 0;
  const cr = fast ? crossing(m, x0, inward) : null;
  const shot = !!cr && cr.y > 44 && cr.y < 116 && cr.t < 1.2 && cr.z < 40;
  if (shot) {
    if (!A.threat) { A.threat = true; A.rolled = false; A.armedAtThreat = m.t; A.diveT = p.y; m.data.threats = ((m.data.threats as number) ?? 0) + 1; }
    const ty = clamp(cr!.y, 52, 108);
    if (m.t - A.armedAtThreat >= K.reaction) {
      const dy = ty - p.y;
      if (Math.abs(dy) > 10 && cr!.t < 0.7) { startDive(m, p, ty); return f; }
      if (Math.abs(dy) > 2) f.my = Math.sign(dy);
    }
    tryRoll(m, p, K, inward);
    return f;
  }
  A.threat = false;
  const looseNear = b.state === 'free' && b.z < 16 && Math.hypot(b.vx, b.vy) < T.gk.looseV && Math.abs(b.x - x0) < T.gk.area && Math.abs(b.y - 80) < 56 && p.noControlT <= 0;
  if (looseNear) { go(b.x, b.y); return f; }
  const out = clamp(Math.abs(b.x - x0) * T.gk.out, T.gk.outMin, T.gk.outMax);
  go(x0 + inward * out, clamp(80 + (b.y - 80) * 0.5, 60, 100));
  return f;
}
