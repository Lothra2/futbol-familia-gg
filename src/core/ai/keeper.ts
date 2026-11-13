import { DIFFICULTY, MATES, T } from '../tuning';
import { GOAL, MID, ownGoalX } from '../field';
import { choosePass, holdBall, restartKick, setTouch, startDive, startStagger } from '../actions';
import { emit } from '../events';
import { addBar } from '../specials';
import { emptyInput, type InputFrame } from '../types';
import { crossing, trajectory } from './predict';
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
export function saveChance(k: KeeperParams, speed: number, z: number, travel: number, quality: number = T.chance.neutral): number {
  const fast = 1 - clamp((speed - T.gk.speedPen) / T.gk.speedPenSpan, 0, 0.5);
  const far = 1 - Math.min(1, Math.max(0, travel - T.gk.farFree) / k.reach);
  // the quality of the chance (chance.ts): a good one is saved less, a poor one more
  const q = clamp(1 + T.chance.k * (T.chance.neutral - quality), 0.2, 1.5);
  return Math.min(0.95, k.skill * fast * (z > 22 ? T.gk.highPen : 1) * far * q);
}

/** The shot that is on its way to this keeper: its quality (chance.ts) and whether it was taken first time. Null when the last touch was not a shot of the other team. */
function incoming(m: Match, p: Player): { q: number; first: boolean } | null {
  const s = m.data.shotQ as { q: number; first: boolean; team: number; t: number } | undefined;
  return s && s.team !== p.team && m.t - s.t < 3 ? s : null;
}

function catchBall(m: Match, p: Player): void {
  const b = m.ball;
  holdBall(m, p);
  p.stats2.saves++; m.stats.saves[p.team]++;
  if (p.team === 0) addBar(m, 0, T.bar.save);   // Thor's saves charge the star bar of the family
  emit(m, 'save', b.x, b.y, b.z, p.id, 1);
}

function punchBall(m: Match, p: Player, inward: 1 | -1): void {
  const b = m.ball;
  b.state = 'free'; b.owner = null;
  if (m.rng.chance(T.gk.tipOver)) { b.vx = -inward * 90; b.vy = m.rng.range(-60, 60); b.vz = 300; }   // tipped over the bar: a corner, like the keepers of Nintendo World Cup
  else { b.vx = inward * T.gk.punch.vx; b.vy = m.rng.range(-T.gk.punch.vy, T.gk.punch.vy); b.vz = T.gk.punch.vz; }
  b.spin = 0;
  p.noControlT = 0.3; setTouch(m, p);
  p.stats2.saves++; m.stats.saves[p.team]++;
  if (p.team === 0) addBar(m, 0, T.bar.save);
  emit(m, 'save', b.x, b.y, b.z, p.id, 0);
}

/** The keeper lets the ball go: to the controlled player if a human asks for it, else to a free teammate, else a long kick. */
export function throwFromKeeper(m: Match, p: Player, to: Player | null): void {
  const inward = (p.team === 0 ? 1 : -1) as 1 | -1;
  let tx: number, ty: number, id = -1;
  if (to) { tx = to.x + to.vx * 0.3; ty = to.y + to.vy * 0.3; id = to.id; }
  else {
    const c = choosePass(m, p, 0, 0, 200);
    if (c) { tx = c.x; ty = c.y; id = c.id; } else { tx = p.x + inward * 220; ty = MID + m.rng.range(-120, 120); }
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
  const by = b.y;
  if (m.rng.chance(saveChance(K, speed, b.z, Math.abs(b.y - A.diveT), incoming(m, p)?.q))) { if (speed < T.gk.catchV) catchBall(m, p); else { punchBall(m, p, inward); if (!p.act) startDive(m, p, by); } }
  // beaten: he still throws himself at it (late), he does not stand and watch it go in
  else if (!p.act) startDive(m, p, by);
}

/** He takes a ball that was not a shot (a cross he came for, a loose ball): it is his, nobody counts a save. */
function claimBall(m: Match, p: Player): void {
  holdBall(m, p);
  emit(m, 'catch', m.ball.x, m.ball.y, m.ball.z, p.id);
}

/** The one on one: he throws himself at the feet of the carrier. With luck the ball is his; without it he is on the ground and the goal is open. */
function smother(m: Match, p: Player, car: Player, K: KeeperParams): void {
  const R = T.gk.rush, easy = car.control === 'human' && car.controls === 'easy';
  p.ai.rushCd = m.t + R.cd; p.ai.rushOn = undefined;
  if (m.rng.chance(Math.min(0.9, K.skill * (easy ? R.easyP : R.p)))) {
    startStagger(m, car, 0.5);
    catchBall(m, p);
    emit(m, 'smother', p.x, p.y, 0, p.id);
  } else { startDive(m, p, m.ball.y); emit(m, 'whiff', p.x, p.y, 0, p.id); }
}

/** The whole behaviour of a goalkeeper (always AI): position, read the shot, react, dive, catch or punch, and throw the ball back. */
export function keeperThink(m: Match, p: Player): InputFrame {
  const f = emptyInput(), b = m.ball, A = p.ai;
  const x0 = ownGoalX(p.team), inward = (p.team === 0 ? 1 : -1) as 1 | -1, K = keeperParams(m, p);
  if (p.act) { if (p.act.kind === 'dive') tryRoll(m, p, K, inward); return f; }   // while he dives the shot can still reach him
  const go = (x: number, y: number): void => { const dx = x - p.x, dy = y - p.y, d = Math.hypot(dx, dy); if (d > 2.5) { f.mx = dx / d; f.my = dy / d; } };

  if (b.state === 'held' && b.owner === p.id) {
    // a person on his team drives him while he holds it (Thor is ours): the stick aims, Pass throws to the mate it points at,
    // Shot kicks it long that way; if nobody does anything he lets it go by himself after a while
    const h = m.humans.find((q) => q.team === p.team), fr = h ? m.hin[h.slot] : null;
    if (A.armedAt === 0) A.armedAt = m.t + (h ? T.gk.humanHold : m.rng.range(T.gk.holdMin, T.gk.holdMax));
    if (fr && p.holdT >= T.gk.humanLock) {
      const st = Math.hypot(fr.mx, fr.my), ax = st > 0.3 ? fr.mx / st : inward, ay = st > 0.3 ? fr.my / st : 0;
      if (fr.passPressed) {
        // the captain with the stick still asks for it herself
        const cap = h!.fixed && st <= 0.3 ? m.players.find((q) => q.id === h!.id) ?? null : null;
        const c = cap ? null : choosePass(m, p, ax, ay, 260);
        throwFromKeeper(m, p, cap ?? (c ? m.players.find((q) => q.id === c.id) ?? null : null));
        return f;
      }
      if (fr.shootPressed) {
        p.immuneT = 0; p.state = 'idle'; A.armedAt = 0; p.holdT = 0;
        restartKick(m, p, p.x + (ax * inward < 0.2 ? inward : ax) * T.gk.punt, Math.max(12, Math.min(388, p.y + ay * T.gk.punt * 0.6)), true);
        return f;
      }
    }
    if (m.t >= A.armedAt) throwFromKeeper(m, p, null);
    return f;
  }
  if (b.owner === p.id) { go(x0 + inward * 24, p.y); if (p.holdT > 0.6) f.passPressed = true; return f; }

  const fast = b.state === 'free' && Math.hypot(b.vx, b.vy) > 100 && b.vx * inward < 0;
  const cr = fast ? crossing(m, x0, inward) : null;
  const shot = !!cr && cr.y > GOAL.y0 - 18 && cr.y < GOAL.y1 + 18 && cr.t < 1.2 && cr.z < 40;
  if (shot) {
    if (!A.threat) { A.threat = true; A.rolled = false; A.armedAtThreat = m.t; A.diveT = p.y; m.data.threats = ((m.data.threats as number) ?? 0) + 1; }
    const ty = clamp(cr!.y, GOAL.y0 - 6, GOAL.y1 + 6);
    if (m.t - A.armedAtThreat >= K.reaction + (incoming(m, p)?.first ? T.chance.firstReact : 0)) {
      const dy = ty - p.y;
      if (Math.abs(dy) > T.gk.diveAt && cr!.t < T.gk.diveIn) { startDive(m, p, ty); return f; }
      if (Math.abs(dy) > 2) f.my = Math.sign(dy);
    }
    tryRoll(m, p, K, inward);
    return f;
  }
  A.threat = false;
  const speed = Math.hypot(b.vx, b.vy), foes = m.players.filter((q) => q.team !== p.team && q.role !== 'gk');
  const tries = (key: 'gkRush' | 'gkClaim'): number => (p.team === 0 ? MATES[key] : DIFFICULTY[m.difficulty][key]);

  // the one on one: a rival brings the ball into the box with no defender on him, and the keeper goes out at his feet
  const car = b.state === 'owned' ? m.players.find((q) => q.id === b.owner) : undefined;
  if (car && car.team !== p.team && m.phase === 'play' && m.t >= (A.rushCd ?? 0) && Math.abs(car.x - x0) < T.gk.rush.zone && Math.abs(car.y - MID) < T.gk.rush.wide) {
    if (!A.rushOn || A.rushOn.id !== car.id || m.t - A.rushOn.t > 4) A.rushOn = { id: car.id, t: m.t, go: m.rng.chance(tries('gkRush')) };
    const covered = m.players.some((q) => q.team === p.team && q.role !== 'gk' && q.state !== 'tumble' && Math.hypot(q.x - car.x, q.y - car.y) < T.gk.rush.free);
    if (A.rushOn.go && !covered) {
      if (Math.hypot(b.x - p.x, b.y - p.y) <= T.gk.rush.contact) { smother(m, p, car, K); return f; }
      go(b.x, b.y); f.sprint = true;
      return f;
    }
  }

  // a high ball that comes down in his box (a cross, a lob): he goes under it and takes it
  if (b.state === 'free' && b.z > 12 && p.noControlT <= 0) {
    const C = T.gk.claim, pts = trajectory(m);
    let land = -1;
    for (let i = 1; i < pts.length; i++) if (pts[i].z <= 14) { land = i; break; }
    if (land > 0 && Math.abs(pts[land].x - x0) < C.area && Math.abs(pts[land].y - MID) < C.wide) {
      if (!A.claimOn || A.claimOn.t !== b.lastTouch.t) A.claimOn = { t: b.lastTouch.t, go: m.rng.chance(tries('gkClaim')) };
      if (A.claimOn.go) {
        if (Math.abs(b.x - p.x) < C.reach && Math.abs(b.y - p.y) < C.reach && b.z < C.z && speed < C.v) { claimBall(m, p); return f; }
        go(pts[land].x, pts[land].y); f.sprint = true;
        return f;
      }
    }
  }

  // a loose ball in his box: his when it is slow, or when he gets to it before any rival
  const L = T.gk.loose;
  if (b.state === 'free' && b.z < 16 && p.noControlT <= 0) {
    const slow = speed < T.gk.looseV && Math.abs(b.x - x0) < T.gk.area && Math.abs(b.y - MID) < 84;
    const dMe = Math.hypot(b.x - p.x, b.y - p.y), dFoe = Math.min(999, ...foes.filter((q) => q.state !== 'tumble').map((q) => Math.hypot(b.x - q.x, b.y - q.y)));
    const first = speed < L.v && Math.abs(b.x - x0) < L.area && Math.abs(b.y - MID) < L.wide && dMe < dFoe + L.edge;
    if (slow || first) { go(b.x + b.vx * 0.15, b.y + b.vy * 0.15); f.sprint = dMe > 24; return f; }
  }

  // nothing to go for: he keeps the angle, on the line from the ball to the middle of his goal, further out when a rival brings it close
  const G = T.gk.angle, dist = Math.hypot(b.x - x0, b.y - MID);
  const k = clamp(G.k0 + (G.k1 - G.k0) * (1 - dist / G.near), G.k0, G.k1);
  let out = clamp(Math.abs(b.x - x0) * T.gk.out, T.gk.outMin, T.gk.outMax);
  if (car && car.team !== p.team && dist < G.carrier) out = Math.max(out, G.outNear * (1 - dist / G.carrier) + T.gk.outMin);
  go(x0 + inward * out, clamp(MID + (b.y - MID) * k, MID - G.max, MID + G.max));
  return f;
}
