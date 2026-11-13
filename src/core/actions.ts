import { T } from './tuning';
import { ESCAPE, GOAL, MID, PITCH, SY, attackDir, goalX, ownGoalX } from './field';
import { lobLaunch, speedToReach } from './ball';
import { emit } from './events';
import { addBar, superShot } from './specials';
import { shotQuality } from './chance';
import { ballAt } from './ai/predict';
import type { Act, KickKind, KickPlan, Match, Player } from './state';

const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
/** Distance from the point (px, py) to the segment a-b. */
export function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1, u = clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1);
  return Math.hypot(px - (ax + dx * u), py - (ay + dy * u));
}
export const playerById = (m: Match, id: number | null): Player | undefined => (id === null ? undefined : m.players.find((q) => q.id === id));
const mates = (m: Match, p: Player): Player[] => m.players.filter((q) => q.team === p.team && q.id !== p.id);
const foes = (m: Match, p: Player): Player[] => m.players.filter((q) => q.team !== p.team);
const LOCK = new Set(['stagger', 'tumble', 'dizzy', 'getup', 'hold', 'dive', 'special']);
/** Sangre caliente: is this team burning right now? */
export const furyOn = (m: Match, team: number): boolean => (m.fury?.[team] ?? 0) > m.t;

// ------------------------------------------------------------------------------------------------ touches and acts
export function setTouch(m: Match, p: Player): void {
  const b = m.ball;
  if (b.lastTouch.player !== p.id) b.prevTouch = { ...b.lastTouch };
  b.lastTouch = { team: p.team, player: p.id, t: m.t };
}

function begin(p: Player, a: Act, state: Player['state']): void { p.act = a; p.state = state; p.stateT = 0; }
export function endAct(p: Player): void { p.act = null; p.state = 'idle'; p.stateT = 0; }

export function dropBall(m: Match, p: Player, vx = 0, vy = 0, vz = 0): void {
  const b = m.ball;
  if (b.owner !== p.id) return;
  b.owner = null; b.state = 'free'; b.vx = vx; b.vy = vy; b.vz = vz;
}
export const startStagger = (m: Match, p: Player, dur: number): void => { dropBall(m, p); begin(p, { kind: 'stagger', t: 0, dur }, 'stagger'); p.holdT = 0; };
/** A fall. Like Nintendo World Cup, a hard hit sends the player flying: `kx`, `ky` push him along the ground (fading out) and `vz` lifts him. */
export const startTumble = (m: Match, p: Player, dur: number, kx = 0, ky = 0, vz = 0): void => {
  dropBall(m, p); begin(p, { kind: 'tumble', t: 0, dur, dx: kx, dy: ky }, 'tumble'); p.holdT = 0;
  if (vz > 0) { p.vz = vz; p.z = Math.max(p.z, 0.5); }
};
export const startDizzy = (p: Player, dur: number): void => begin(p, { kind: 'dizzy', t: 0, dur }, 'dizzy');
export const startGetup = (p: Player, dur: number): void => begin(p, { kind: 'getup', t: 0, dur }, 'getup');
/** A keeper stretches towards y. The save itself is rolled by ai/keeper.ts; the dive moves him and plays the pose. */
export const startDive = (m: Match, p: Player, ty: number): void => { begin(p, { kind: 'dive', t: 0, dur: T.gk.diveT, dy: ty }, 'dive'); emit(m, 'dive', p.x, p.y, 0, p.id); };

/** A keeper has the ball in his hands (or Thor in his mouth): it is his until he lets it go. */
export function holdBall(m: Match, p: Player): void {
  const b = m.ball;
  b.state = 'held'; b.owner = p.id; b.vx = b.vy = b.vz = 0; b.spin = 0; b.inNet = false;
  p.act = null; p.state = 'hold'; p.immuneT = 99; p.holdT = 0; p.ai.armedAt = 0; p.vx = p.vy = 0;
  setTouch(m, p);
}

// ------------------------------------------------------------------------------------------------ launching the ball
/** Lets the ball go with a given velocity. Everything that kicks goes through here. */
export function releaseBall(m: Match, p: Player, vx: number, vy: number, vz: number, spin = 0, kind: string = 'kick'): void {
  const b = m.ball;
  b.state = 'free'; b.owner = null; b.vx = vx; b.vy = vy; b.vz = vz; b.spin = spin; b.inNet = false;
  p.noControlT = T.immune; p.holdT = 0;
  setTouch(m, p);
  emit(m, kind, b.x, b.y, b.z, p.id, Math.hypot(vx, vy));
}

/** Lateral drift of a ball with effect, so the aim can be corrected and the ball curves INTO the aimed point. */
export const curveDrift = (spin: number, dist: number, speed: number): number => {
  const t = dist / Math.max(60, speed * 0.85), k = T.spinDecay;
  return ((spin * T.spinAccel * Math.min(1, (speed * 0.85) / 300)) / k) * (t - (1 - Math.exp(-k * t)) / k);
};

/** Resolves a kick at the moment of contact, from the real position of the ball. */
function launch(m: Match, p: Player, plan: KickPlan): void {
  const b = m.ball;
  const passLike = (plan.kind === 'pass' || plan.kind === 'chip' || (plan.kind === 'header' && plan.target !== undefined)) && !plan.vaselina;
  const err = plan.err / (passLike ? Math.max(0.5, p.stats.passAcc) : 1);
  let tx = plan.tx, ty = plan.ty + m.rng.range(-err, err);
  // one-two: the receiver of a pass returns it, low, to the one who passed while he runs
  let boost = 1;
  if (plan.kind === 'pass' && m.lastPass && m.lastPass.to === p.id && m.lastPass.team === p.team && m.t - m.lastPass.t <= T.wallWindow && plan.target === m.lastPass.from) {
    const f = playerById(m, m.lastPass.from);
    if (f) { const sp = Math.hypot(f.vx, f.vy) || 1; tx += (f.vx / sp) * T.wallLead; ty += (f.vy / sp) * T.wallLead; boost = T.wallBoost; emit(m, 'wall', b.x, b.y, 0, p.id); addBar(m, p.team, T.bar.wall); }
  }
  let dx = tx - b.x, dy = ty - b.y;
  const d = Math.hypot(dx, dy) || 1;
  if (plan.spin) dy -= curveDrift(plan.spin, d, plan.speed || 300);
  const dd = Math.hypot(dx, dy) || 1;
  const ux = dx / dd, uy = dy / dd;
  let v = 0, vz = plan.vz;
  if (plan.kind === 'pass') { v = Math.min(T.kickCap, clamp(speedToReach(d, T.passEnd), T.passMin, T.passMax) * boost); vz = 0; }
  else if (plan.kind === 'chip') { const l = lobLaunch(Math.min(d, T.lobMaxD)); v = l.v; vz = l.vz; }
  else if (plan.kind === 'restart' && plan.lob) { const l = lobLaunch(Math.min(d, T.lobMaxD)); v = l.v; vz = l.vz; }
  else if (plan.kind === 'restart') { v = clamp(speedToReach(d, T.passEnd), T.passMin, T.passMax); vz = 0; }
  else v = Math.min(T.kickCap, plan.speed * (plan.assist ? 1.1 : 1) * p.stats.power * (furyOn(m, p.team) ? T.fury.power : 1));
  if ((plan.kind === 'pass' || plan.kind === 'chip') && !plan.vaselina) { m.lastPass = { from: p.id, to: plan.target ?? -1, t: m.t, team: p.team }; p.stats2.passes++; if (plan.kind === 'chip') p.stats2.chips++; }
  if (plan.kind === 'shot' || plan.kind === 'spin' || plan.kind === 'volley' || plan.kind === 'chilena' || plan.vaselina || (plan.kind === 'header' && plan.target === undefined)) {
    p.stats2.shots++;
    m.data.shotQ = { q: shotQuality(m, p, plan.ty, !!plan.first), first: !!plan.first, team: p.team, t: m.t };   // read by the keeper when he rolls the save
    if (Math.abs(goalX(p.team) - b.x) < 320) { m.stats.shots[p.team]++; addBar(m, p.team, plan.ty >= 58 && plan.ty <= 102 ? T.bar.shot : T.bar.shotOff); }
  }
  releaseBall(m, p, ux * v, uy * v, vz, plan.spin, (plan.kind === 'pass' || plan.kind === 'chip') && !plan.vaselina ? 'pass' : 'kick');
  m.ball.kick = { kind: plan.kind === 'shot' && (plan.hard ?? 0) > 0.6 ? 'hard' : plan.kind, t: m.t };
  if (plan.kind === 'spin') { emit(m, 'spinkick', m.ball.x, m.ball.y, m.ball.z, p.id, Math.hypot(ux * v, uy * v)); if (p.team === 0) m.data.spins = ((m.data.spins as number) ?? 0) + 1; }
  // a shot of a person can be bent while it flies (match.ts reads the stick of whoever shot it)
  if (p.control === 'human' && p.humanSlot !== null && (plan.kind === 'shot' || plan.kind === 'spin' || plan.kind === 'volley' || plan.kind === 'chilena')) m.data.banana = { who: p.id, slot: p.humanSlot, until: m.t + T.banana.window };
  else m.data.banana = undefined;
}

// ------------------------------------------------------------------------------------------------ choosing where to pass
export interface PassChoice { id: number; x: number; y: number }
/** Best teammate for a pass. With the stick pointing somewhere: the one inside a 60 degree cone. Without: the best forward one. */
export function choosePass(m: Match, p: Player, sx: number, sy: number, maxD: number = T.lobMaxD): PassChoice | null {
  const dir = attackDir(p.team), stick = Math.hypot(sx, sy);
  const cands = mates(m, p).filter((q) => q.role !== 'gk').map((q) => ({ q, d: Math.hypot(q.x - p.x, q.y - p.y) })).filter((c) => c.d >= 24 && c.d <= maxD);
  let best: { q: Player; s: number } | null = null;
  // the stick points inside a 30 degree cone; when nobody is there, a wider one (50 degrees) is tried before the pass goes to an empty place,
  // because a mate who runs moves out of the cone in the time it takes to press the button
  for (const cone of stick > 0.35 ? [T.passCone, T.passConeWide] : [T.passCone]) {
    for (const { q, d } of cands) {
      const ax = (q.x - p.x) / d, ay = (q.y - p.y) / d;
      let s: number;
      if (stick > 0.35) {
        const ang = Math.acos(clamp((ax * sx + ay * sy) / stick, -1, 1));
        if (ang > cone) continue;
        s = 1 - ang / cone - d / 1000;
      } else {
        const fwd = (q.x - p.x) * dir;
        if (fwd < -40) continue;
        let near = 0;
        for (const o of foes(m, p)) { const od = Math.hypot(o.x - q.x, o.y - q.y); if (od < 30) near += (30 - od) / 30; }
        // a pass that a rival can cut on its way (a rival close to the line of the pass) is a bad pass, and so is a very long one
        let cut = 0;
        for (const o of foes(m, p)) if (segDist(o.x, o.y, p.x, p.y, q.x, q.y) < T.space.cutDist) cut += 0.6;
        s = fwd / 200 - Math.abs(q.y - p.y) / 1200 - near - cut - (d < 60 ? 0.3 : 0) - Math.max(0, d - 160) / 300;
      }
      if (!best || s > best.s) best = { q, s };
    }
    if (best) break;
  }
  if (!best) return null;
  const q = best.q, d = Math.hypot(q.x - p.x, q.y - p.y);
  // a receiver who runs forward gets the ball into the space he is running to (through pass), not to his feet
  const deep = q.vx * attackDir(p.team) > T.space.deepV;
  const lead = deep ? Math.min(T.space.deepLead, d / 180) : Math.min(0.6, d / 250);
  return { id: q.id, x: clamp(q.x + q.vx * lead, ESCAPE.x0 + 8, ESCAPE.x1 - 8), y: clamp(q.y + q.vy * lead, 4, PITCH.d - 4) };
}

// ------------------------------------------------------------------------------------------------ planning kicks
const ballNear = (m: Match, p: Player, dx: number, dy: number): boolean => Math.abs(m.ball.x - p.x) < dx && Math.abs(m.ball.y - p.y) < dy;

function shotTarget(m: Match, p: Player, assist: boolean): { ty: number; spin: number } {
  const sy = p.input.my;
  if (assist) {
    const gk = m.players.find((q) => q.team !== p.team && q.role === 'gk');
    return { ty: gk && gk.y < MID ? MID + 18 : MID - 18, spin: 0 };
  }
  // the aim follows the stick continuously: the middle of the goal +- T.chance.aim px (just inside the posts), a small dead zone keeps the centre
  return { ty: Math.abs(sy) < 0.15 ? MID : clamp(MID + clamp(sy, -1, 1) * T.chance.aim, GOAL.y0 + 3, GOAL.y1 - 3), spin: 0 };
}

/** A tapped shot by a person with the keeper off his line and close: a chip over him (a shot for the stats, the bar and the keeper). */
function vaselinaPlan(m: Match, p: Player): KickPlan | null {
  if (p.control !== 'human') return null;
  const gk = m.players.find((q) => q.team !== p.team && q.role === 'gk'), gx = goalX(p.team), dir = attackDir(p.team);
  if (!gk || Math.abs(gk.x - gx) <= T.vasel.out || Math.hypot(gk.x - p.x, gk.y - p.y) >= T.vasel.near || Math.abs(gx - m.ball.x) >= T.vasel.range) return null;
  return { kind: 'chip', speed: 0, vz: 0, tx: gx + dir * 10, ty: clamp(MID + clamp(p.input.my, -1, 1) * T.vasel.up, MID - 30, MID + 30), err: 4, spin: 0, lob: true, vaselina: true };
}

export function planShot(m: Match, p: Player, hold: number, assist = false): KickPlan {
  if (!assist && hold < T.tapTime) { const v = vaselinaPlan(m, p); if (v) return v; }
  const { ty } = shotTarget(m, p, assist);
  const sy = p.input.my, eff = !assist && Math.abs(sy) > 0.3 ? Math.sign(sy) : 0;
  const hard = hold >= T.tapTime ? clamp(hold / T.hardTime, 0, 1) : 0;
  if (hard > 0) {
    return { kind: 'shot', speed: T.shotHard.v + T.hardV * hard, vz: T.shotHard.vzV + T.hardVz * hard, tx: goalX(p.team), ty, err: (p.control === 'ai' ? p.aiErr * 0.8 : T.shotHard.err) + T.hardErr * hard, spin: eff * T.effectHard, hard };
  }
  return { kind: 'shot', speed: T.shotNormal.v, vz: T.shotNormal.vz, tx: goalX(p.team), ty, err: assist ? 4 : p.control === 'ai' ? p.aiErr : T.shotNormal.err, spin: eff * T.effect, assist };
}

/** A cross: a high pass from the wing in the last 220 px goes to the far post (a forward who is there, or the spot). */
function crossTarget(m: Match, p: Player): PassChoice | null {
  const gx = goalX(p.team), dir = attackDir(p.team);
  if (Math.abs(gx - m.ball.x) > T.cross.zone || (p.y > T.cross.wing && p.y < PITCH.d - T.cross.wing)) return null;
  const spot = { x: gx - dir * T.cross.post, y: p.y < MID ? MID + T.cross.far : MID - T.cross.far };
  let best: Player | null = null, bd: number = T.cross.snap;
  for (const q of mates(m, p)) { if (q.role === 'gk') continue; const d = Math.hypot(q.x - spot.x, q.y - spot.y); if (d < bd) { bd = d; best = q; } }
  return best ? { id: best.id, x: clamp(best.x + best.vx * 0.3, ESCAPE.x0 + 8, ESCAPE.x1 - 8), y: clamp(best.y + best.vy * 0.3, 4, PITCH.d - 4) } : { id: -1, x: spot.x, y: spot.y };
}

export function planPass(m: Match, p: Player, lob: boolean): KickPlan {
  const cr = lob ? crossTarget(m, p) : null;
  if (cr) return { kind: 'chip', speed: 0, vz: 0, tx: cr.x, ty: cr.y, err: T.lobErr, spin: 0, lob: true, target: cr.id >= 0 ? cr.id : undefined };
  const c = choosePass(m, p, p.input.mx, p.input.my, lob ? T.lobMaxD : T.passMax * 1.2);
  const stick = Math.hypot(p.input.mx, p.input.my);
  if (c) return { kind: lob ? 'chip' : 'pass', speed: 0, vz: 0, tx: c.x, ty: c.y, err: lob ? T.lobErr : T.passErr, spin: 0, lob, target: c.id };
  // nobody there: a free pass along the stick, or forward
  const dir = stick > 0.35 ? { x: p.input.mx / stick, y: p.input.my / stick } : { x: attackDir(p.team), y: 0 };
  return { kind: lob ? 'chip' : 'pass', speed: 0, vz: 0, tx: m.ball.x + dir.x * 140, ty: clamp(m.ball.y + dir.y * 100, 6, PITCH.d - 6), err: T.passErr, spin: 0, lob };
}

function startKick(m: Match, p: Player, plan: KickPlan, prep: number, floor = 0): void {
  const dx = plan.tx - p.x;
  if (Math.abs(dx) > 4) p.facing = dx > 0 ? 1 : -1;
  if (plan.air && p.z <= 0 && (plan.kind === 'header' || plan.kind === 'chilena')) p.vz = plan.dive ? T.dive.hop : T.jumpV * (plan.kind === 'chilena' ? 0.9 : 1);
  begin(p, { kind: 'kick', t: 0, dur: prep + T.kickRecover, contact: prep, plan, sub: plan.kind }, 'kick');
  p.act!.dx = floor;
  p.shoot.down = false; p.pass.down = false;
}

const PREP: Record<KickKind, number> = { pass: T.passPrep, chip: T.passPrep, shot: T.shotPrep, volley: T.volleyPrep, header: T.headerPrep, chilena: T.chilenaPrep, restart: T.passPrep, spin: T.spin.prep };

/** What an airborne free ball asks of a player standing under it. */
/** The target of a pass in the air (a cross, a lob) gets a window 30 % bigger to reach it with the head or the foot. */
export const aerialK = (m: Match, p: Player): number => (m.lastPass && m.lastPass.to === p.id && m.lastPass.team === p.team && m.t - m.lastPass.t < 2.5 ? T.aerialTargetMult : 1);

export function aerialZone(m: Match, p: Player): 'volley' | 'header' | null {
  const b = m.ball;
  if (b.state !== 'free' || p.noControlT > 0) return null;
  const k = aerialK(m, p);
  if (!ballNear(m, p, T.aerial.dx * k, T.aerial.dy * k)) return null;
  if (b.z >= T.aerial.zMin && b.z < T.aerial.volleyZ) return 'volley';
  if (b.z >= T.aerial.volleyZ && b.z <= T.aerial.headerZ) return 'header';
  return null;
}

/** The same for a player who has already jumped: the height of the ball is counted from his feet, so he reaches balls nobody reaches from the ground. */
export function airZone(m: Match, p: Player): 'volley' | 'header' | null {
  const b = m.ball;
  if (b.state !== 'free' || p.noControlT > 0 || p.z <= 0) return null;
  const k = aerialK(m, p), rz = b.z - p.z;
  if (!ballNear(m, p, T.aerial.dx * k, T.aerial.dy * k) || rz < T.jump.lo || rz > T.jump.hi) return null;
  return rz >= T.jump.headZ ? 'header' : 'volley';
}

/** La patada giratoria: the shot of a player who is in the air with the ball. */
export function planSpin(m: Match, p: Player): KickPlan {
  const { ty } = shotTarget(m, p, false), sy = p.input.my, eff = Math.abs(sy) > 0.3 ? Math.sign(sy) : 0;
  return { kind: 'spin', speed: T.spin.v, vz: T.spin.vz, tx: goalX(p.team), ty, err: p.control === 'ai' ? p.aiErr * 0.8 : T.spin.err, spin: eff * T.effect, air: true, first: true, jumped: true };
}

/** El salto. */
export function startJump(m: Match, p: Player): boolean {
  if (p.z > 0 || p.cd.jump > 0 || p.role === 'gk' || m.phase !== 'play') return false;
  p.vz = T.jump.v; p.z = 0.5; p.shoot.down = false; p.pass.down = false;
  emit(m, 'jump', p.x, p.y, 0, p.id);
  return true;
}

function planAerial(m: Match, p: Player, zone: 'volley' | 'header', viaPass: boolean): { plan: KickPlan; prep: number; floor: number } {
  const gx = goalX(p.team), dir = attackDir(p.team);
  const { ty } = shotTarget(m, p, false);
  // la palomita (Nintendo World Cup): he was running at a ball at the height of his waist and throws himself flat at it, head first
  if (zone === 'volley' && !viaPass && p.z <= 0 && p.facing === dir && p.vx * dir >= T.dive.minV * 0.7 && Math.hypot(p.vx, p.vy) >= T.dive.minV)
    return { plan: { kind: 'header', dive: true, speed: T.dive.v, vz: T.dive.vz, tx: gx, ty, err: T.dive.err, spin: 0, air: true }, prep: T.dive.prep, floor: T.dive.floor };
  if (zone === 'volley') return { plan: { kind: 'volley', speed: T.volley.v, vz: T.volley.vz, tx: gx, ty, err: T.volley.err, spin: 0, air: true }, prep: T.volleyPrep, floor: 0 };
  if (viaPass) {
    const c = choosePass(m, p, p.input.mx, p.input.my, 260);
    const tx = c ? c.x : m.ball.x + dir * 160, ty2 = c ? c.y : m.ball.y;
    return { plan: { kind: 'header', speed: 240, vz: T.header.vzUp, tx, ty: ty2, err: T.header.err, spin: 0, air: true, target: c?.id }, prep: T.headerPrep, floor: 0 };
  }
  if (p.facing === -dir) return { plan: { kind: 'chilena', speed: T.chilena.v, vz: T.chilena.vz, tx: gx, ty, err: T.chilena.err, spin: 0, air: true }, prep: T.chilenaPrep, floor: T.chilenaFloor };
  if (Math.abs(gx - m.ball.x) < 200) return { plan: { kind: 'header', speed: T.header.v, vz: T.header.vzDown, tx: gx, ty, err: T.header.err, spin: 0, air: true }, prep: T.headerPrep, floor: 0 };
  const sx = p.input.mx, sy = p.input.my, st = Math.hypot(sx, sy);
  const d = st > 0.3 ? { x: sx / st, y: sy / st } : { x: dir, y: 0 };
  return { plan: { kind: 'header', speed: T.header.v, vz: T.header.vzUp, tx: m.ball.x + d.x * 200, ty: clamp(m.ball.y + d.y * 200, 4, PITCH.d - 4), err: T.header.err, spin: 0, air: true }, prep: T.headerPrep, floor: 0 };
}

// ------------------------------------------------------------------------------------------------ slide, steal, bump
export function startSlide(m: Match, p: Player): boolean {
  if (p.cd.slide > 0 || p.z > 0) return false;
  const st = Math.hypot(p.input.mx, p.input.my);
  const d = st > 0.3 ? { x: p.input.mx / st, y: p.input.my / st } : { x: p.facing, y: 0 };
  if (Math.abs(d.x) > 0.1) p.facing = d.x > 0 ? 1 : -1;
  p.cd.slide = T.slide.cd;
  begin(p, { kind: 'slide', t: 0, dur: T.slide.dur, dx: d.x, dy: d.y }, 'slide');
  emit(m, 'slide', p.x, p.y, 0, p.id);
  return true;
}

/** Contact test of a slide: the ball first, then the legs of a rival. */
function slideContacts(m: Match, p: Player, a: Act): void {
  const dx = a.dx!, dy = a.dy!, b = m.ball;
  const within = (x: number, y: number, reach: number, half: number): boolean => {
    const rx = x - p.x, ry = y - p.y, ahead = rx * dx + ry * dy, side = Math.abs(-rx * dy + ry * dx);
    return ahead >= -4 && ahead <= reach && side <= half;
  };
  if (!a.done && b.z < T.slide.ballZ && b.state !== 'dead' && b.state !== 'held' && within(b.x, b.y, T.slide.reach, T.slide.half + 2)) {
    const carrier = playerById(m, b.owner);
    if (!carrier || carrier.team !== p.team) {
      if (carrier) { carrier.holdT = 0; startStagger(m, carrier, T.slide.ballStagger); p.stats2.steals++; addBar(m, p.team, T.bar.steal); emit(m, 'steal', b.x, b.y, 0, p.id); }
      b.state = 'free'; b.owner = null; b.vx = dx * T.slide.kickV; b.vy = m.rng.range(-T.slide.kickVy, T.slide.kickVy); b.vz = 0; b.inNet = false;
      setTouch(m, p); emit(m, 'slideball', b.x, b.y, 0, p.id);
      a.done = true;
    }
  }
  if (!a.done) {
    for (const o of foes(m, p)) {
      if (LOCK.has(o.state) || o.z > 8 || o.immuneT > 0 && m.ball.owner === o.id) continue;
      if (within(o.x, o.y, T.slide.reach + 4, T.slide.half + 3)) {
        knockDown(m, o, p, (a.dx ?? 0) * T.fly.slide, (a.dy ?? 0) * T.fly.slide, T.fly.slideVz);
        emit(m, 'slidehit', o.x, o.y, 0, o.id);
        // no fouls in Nekketsu: whoever is knocked down is down, and play goes on
        startDizzy(p, T.slide.dizzy);
        return;
      }
    }
  }
}

/** A player is knocked down and stays out of the game for a while (Nekketsu). The hits add up: three close together and he is out longer. */
export function knockDown(m: Match, o: Player, from: Player | null, kx: number, ky: number, vz: number, extra = 1): void {
  const h = (o.hits ??= { n: 0, t: -99 });
  h.n = m.t - h.t < T.hit.combo ? h.n + 1 : 1; h.t = m.t;
  const ko = h.n >= T.hit.koAfter, dur = (ko ? T.hit.ko : T.hit.down) * extra * (furyOn(m, o.team) ? T.fury.down : 1);
  if (ko) h.n = 0;
  startTumble(m, o, dur, kx, ky, vz);
  o.immuneT = dur + 0.4;   // nobody hits a player who is down
  emit(m, ko ? 'ko' : 'down', o.x, o.y, 0, o.id, from ? from.id : -1);
}

/** The rival a hit would reach: in front of the player, close, standing; the one with the ball first. */
export function hitTarget(m: Match, p: Player, slack = false): Player | null {
  if (p.cd.steal > 0 || m.phase !== 'play' || LOCK.has(p.state) || p.act) return null;
  const R = T.hit.reach + (slack ? T.hit.slack.x : 0), DY = T.hit.dy + (slack ? T.hit.slack.y : 0);
  let best: Player | null = null, bs = Infinity;
  for (const o of foes(m, p)) {
    if (LOCK.has(o.state) || o.immuneT > 0 || o.z > 12 || (o.role === 'gk' && m.ball.owner === o.id && m.ball.state === 'held')) continue;
    const fx = (o.x - p.x) * p.facing;
    if (fx < -4 || fx > R || Math.abs(o.y - p.y) > DY) continue;
    const sc = Math.hypot(o.x - p.x, o.y - p.y) - (m.ball.owner === o.id ? 100 : 0);
    if (sc < bs) { bs = sc; best = o; }
  }
  return best;
}

/** Golpe o patada (Nekketsu): Tiro without the ball next to a rival. When it lands he goes down and stays out a while, and if he had the ball it
 *  is yours. When it misses the one who swung stumbles. Returns whether a blow was thrown. */
export function tryHit(m: Match, p: Player, slack = false): boolean {
  const o = hitTarget(m, p, slack);
  if (!o) return false;
  const b = m.ball, had = b.owner === o.id;
  p.cd.steal = T.hit.cd;
  p.blow = p.blow === 'punch' ? 'kick' : 'punch';
  begin(p, { kind: 'hit', t: 0, dur: T.hit.self, blow: p.blow }, 'bump');
  const easyCarrier = had && o.control === 'human' && o.controls === 'easy';
  const contained = (p.containT ?? 0) >= T.contain.after ? T.contain.stealBonus : 1;
  if (m.rng.chance(Math.min(0.97, (easyCarrier ? T.hit.easyP : T.hit.p) * contained * (furyOn(m, p.team) ? T.fury.hit : 1)))) {
    landBlow(m, p, o, contained > 1);
  } else {
    p.act = null; startStagger(m, p, T.steal.fail);
    emit(m, 'whiff', p.x, p.y, 0, p.id);
  }
  return true;
}
/** A blow that lands: the rival goes down and stays out a while; if he had the ball it is yours or it pops loose. */
function landBlow(m: Match, p: Player, o: Player, contained = false): void {
  const b = m.ball, had = b.owner === o.id;
  const d = Math.sign(o.x - p.x) || p.facing;
  knockDown(m, o, p, d * T.fly.steal, (o.y - p.y) * 3, T.fly.stealVz);
  emit(m, 'hit', o.x, o.y, 0, p.id, p.blow === 'kick' ? 1 : 0);
  if (had && m.rng.chance(T.hit.keep)) { b.owner = p.id; b.state = 'owned'; p.immuneT = T.immune; p.stats2.steals++; setTouch(m, p); addBar(m, p.team, T.bar.steal + (contained ? T.bar.containSteal : 0)); emit(m, 'steal', b.x, b.y, 0, p.id); }
  else if (had) {
    // the ball pops loose from the one who went down: a scramble, and now and then it goes out (Nekketsu)
    b.state = 'free'; b.owner = null; b.vx = d * m.rng.range(60, 160); b.vy = m.rng.range(-170, 170); b.vz = m.rng.range(40, 120); b.inNet = false; setTouch(m, p);
    p.stats2.steals++; addBar(m, p.team, T.bar.steal);
  }
}

/** La patada voladora: Tiro in the air without a ball to strike. Whoever it meets before the player lands goes down (updateAct looks every step). */
export function startFlyKick(m: Match, p: Player): boolean {
  if (p.cd.steal > 0 || p.z <= 0 || m.phase !== 'play') return false;
  p.cd.steal = T.hit.cd; p.blow = 'kick';
  begin(p, { kind: 'hit', t: 0, dur: T.flyKick.dur, blow: 'kick', air: true }, 'bump');
  emit(m, 'flykick', p.x, p.y, p.z, p.id);
  return true;
}
/** The rival the flying kick meets right now. */
function flyKickTarget(m: Match, p: Player): Player | null {
  for (const o of foes(m, p)) {
    if (LOCK.has(o.state) || o.immuneT > 0 || Math.abs(o.z - p.z) > T.flyKick.z || (o.role === 'gk' && m.ball.owner === o.id && m.ball.state === 'held')) continue;
    const fx = (o.x - p.x) * p.facing;
    if (fx >= -4 && fx <= T.flyKick.reach && Math.abs(o.y - p.y) <= T.flyKick.dy) return o;
  }
  return null;
}

/** The rival flat on the ground next to this player, to laugh at. */
export function downedNear(m: Match, p: Player): Player | null {
  for (const o of foes(m, p)) {
    if (o.state !== 'tumble' || o.z > 2 || !o.act || o.act.t < 0.5) continue;
    if (Math.abs(o.x - p.x) <= T.taunt.reach && Math.abs(o.y - p.y) <= T.taunt.dy) return o;
  }
  return null;
}
/** La burla (Kunio does it all the time): he laughs at the rival he has at his feet. Returns whether he did. */
export function startTaunt(m: Match, p: Player): boolean {
  const o = p.cd.steal > 0 || p.z > 0 || m.phase !== 'play' ? null : downedNear(m, p);
  if (!o) return false;
  p.cd.steal = T.taunt.cd;
  if (Math.abs(o.x - p.x) > 2) { p.facing = o.x > p.x ? 1 : -1; p.dirX = p.facing; p.dirY = 0; }
  begin(p, { kind: 'taunt', t: 0, dur: T.taunt.dur }, 'bump');
  if (o.act && !o.act.taunted) { o.act.taunted = true; addBar(m, p.team, T.taunt.bar); }
  emit(m, 'taunt', p.x, p.y, 0, p.id, o.id);
  return true;
}

/** The old names: a steal is a hit now. */
export const tryFrontSteal = tryHit;

/** A sprinting player runs into the rival who carries the ball. */
export function checkBump(m: Match, p: Player): void {
  if (p.state !== 'sprint' || p.cd.bump > 0 || m.phase !== 'play') return;
  const c = playerById(m, m.ball.owner);
  if (!c || c.team === p.team || c.immuneT > 0 || LOCK.has(c.state) || c.z > 10) return;
  const dx = c.x - p.x, dy = c.y - p.y;
  if (Math.abs(dx) > T.bump.dx || Math.abs(dy) > T.bump.dy || dx * p.vx + dy * p.vy <= 0) return;
  p.cd.bump = T.bump.cd;
  emit(m, 'bump', c.x, c.y, 0, p.id);
  if (m.rng.chance(T.bump.p * p.stats.resist / c.stats.resist)) {
    const n = Math.hypot(p.vx, p.vy) || 1;
    dropBall(m, c, (p.vx / n) * 70, (p.vy / n) * 70 + m.rng.range(-30, 30), 0);
    m.ball.state = 'free'; setTouch(m, p);
    knockDown(m, c, p, (p.vx / n) * T.fly.bump, (p.vy / n) * T.fly.bump, T.fly.bumpVz); c.holdT = 0;   // a body check knocks him down
  }
  begin(p, { kind: 'bump', t: 0, dur: T.bump.self }, 'bump');
}

// ------------------------------------------------------------------------------------------------ input interpretation
function track(b: { down: boolean; t: number }, held: boolean, pressed: boolean, dt: number): { press: boolean; release: boolean; t: number } {
  let press = false, release = false;
  if (pressed) { b.down = true; b.t = 0; press = true; }
  if (b.down) { if (held) { if (!press) b.t += dt; } else { release = true; b.down = false; } }
  return { press, release, t: b.t };
}

/** Turns one player's input into an action. Called only when the player is free to act (no act in progress, not locked). */
export function handleInput(m: Match, p: Player, dt: number): void {
  const inp = p.input, b = m.ball;
  const sh = track(p.shoot, inp.shoot, inp.shootPressed, dt), pa = track(p.pass, inp.pass, inp.passPressed, dt);
  if (m.phase !== 'play') return;
  const own = b.owner === p.id;
  const easy = p.control === 'human' && p.controls === 'easy';
  const zone = aerialZone(m, p);

  if (easy) {
    if (!(sh.press || pa.press)) return;
    if (own) {
      const toGoal = Math.abs(goalX(p.team) - p.x);
      if (toGoal < 240 && Math.abs(p.y - MID) < 60 * SY) { startKick(m, p, planShot(m, p, 0, true), T.shotPrep); return; }
      // pass only to a teammate who is clearly further ahead and free; otherwise a long touch towards the goal
      const c = choosePass(m, p, 0, 0, T.passMax * 1.2);
      const dir0 = attackDir(p.team);
      const free = !!c && (c.x - p.x) * dir0 >= T.easy.passAhead && !foes(m, p).some((o) => Math.hypot(o.x - c.x, o.y - c.y) < T.easy.passFree);
      if (c && free) { const saved = { mx: p.input.mx, my: p.input.my }; p.input.mx = p.input.my = 0; const plan = planPass(m, p, false); p.input.mx = saved.mx; p.input.my = saved.my; startKick(m, p, plan, T.passPrep); return; }
      const d = attackDir(p.team);
      startKick(m, p, { kind: 'restart', speed: 0, vz: 0, tx: b.x + d * 100, ty: clamp(b.y, 8, PITCH.d - 8), err: 0, spin: 0 }, T.passPrep);
      return;
    }
    if (zone) { const a = planAerial(m, p, zone, false); startKick(m, p, a.plan, a.prep, a.floor); return; }
    if (!tryFrontSteal(m, p)) startTaunt(m, p);
    return;
  }

  // the jump (Nekketsu): its own button, or Tiro and Pase together like A + B on the NES
  if (p.z <= 0 && (inp.jumpPressed || (sh.press && pa.press) || (own && ((sh.press && p.pass.down) || (pa.press && p.shoot.down)))) && startJump(m, p)) return;
  if (p.z > 0) {
    // in the air: with the ball Tiro is the spinning kick and Pase a pass from up there; a ball within reach is struck with the head or the
    // foot; and with no ball to strike Tiro is the flying kick
    if (own) {
      if (sh.press) {
        // near the goal it is his power shot (Nekketsu: jump with the ball and kick it up there), best right at the top of the jump;
        // from far it is the spinning kick, a hard shot
        if (inPowerRange(m, p)) {
          const top = Math.abs(p.vz) <= T.airPower.apexV;
          if (top) emit(m, 'airtop', p.x, p.y, p.z, p.id);
          superShot(m, p, top ? T.airPower.apex : 0, 'spin');
          if (p.team === 0) m.data.spins = ((m.data.spins as number) ?? 0) + 1;
        } else startKick(m, p, planSpin(m, p), T.spin.prep);
        p.vz = Math.max(p.vz, T.spin.hang);
      }
      else if (pa.press) startKick(m, p, { ...planPass(m, p, false), jumped: true }, T.jump.prep);
      return;
    }
    const az = airZone(m, p);
    if (az && (sh.press || pa.press)) { const a = planAerial(m, p, az, pa.press && !sh.press); startKick(m, p, { ...a.plan, jumped: true }, T.jump.prep, a.floor); return; }
    if (!az && sh.press) startFlyKick(m, p);
    return;
  }

  // first time: a button pressed up to `buffer` s before the ball reaches the player is kept and taken the moment it does, as a shot or a pass
  const reach = b.state === 'free' && b.z < T.ctrl.z && ballNear(m, p, T.firstTimeReach, T.firstTimeReach * 0.7) && p.noControlT <= 0;
  if (own) p.buf = null;
  else if (p.buf) {
    if (m.t > p.buf.until) p.buf = null;
    else if (reach) {
      const kind = p.buf.kind; p.buf = null;
      const pl = kind === 'shoot' ? planShot(m, p, 0) : planPass(m, p, false);
      startKick(m, p, { ...pl, first: true }, kind === 'shoot' ? PREP.shot : PREP.pass); return;
    }
  }
  if (own) {
    if (sh.release || (p.shoot.down && p.shoot.t >= T.autoFire)) { p.shoot.down = false; startKick(m, p, planShot(m, p, sh.release ? sh.t : p.shoot.t), PREP.shot); return; }
    if (pa.release) { const lob = pa.t >= T.lobHold; startKick(m, p, planPass(m, p, lob), PREP.pass); }
    return;
  }
  if (zone) {
    if (sh.press) { const a = planAerial(m, p, zone, false); startKick(m, p, a.plan, a.prep, a.floor); return; }
    if (pa.press) { const a = planAerial(m, p, zone, true); startKick(m, p, a.plan, a.prep, a.floor); }
    return;
  }
  const loose = reach;
  if (p.control === 'human' && (sh.press || pa.press) && b.state === 'free' && !reach) {
    // will the ball be at my feet in the next quarter second? Then the press waits for it instead of being a slide
    for (let t = 0.05; t <= T.bufferArrive + 1e-6; t += 0.05) {
      const pt = ballAt(m, t);
      if (pt.z < T.ctrl.z && Math.abs(pt.x - p.x) < T.firstTimeReach && Math.abs(pt.y - p.y) < T.firstTimeReach * 0.7) { p.buf = { kind: sh.press ? 'shoot' : 'pass', until: m.t + T.buffer }; return; }
    }
  }
  if (loose && sh.release) { startKick(m, p, planShot(m, p, 0), PREP.shot); return; }
  if (sh.press) {
    if (p.control === 'ai') { if (inp.slide) startSlide(m, p); else tryHit(m, p); }
    else {
      // "close hits, far slides" (Nekketsu): a rival right in front gets a punch or a kick, anywhere else it is a slide
      // and with a rival flat at his feet he laughs at him instead
      if (hitTarget(m, p, true)) tryHit(m, p, true);
      else if (!startTaunt(m, p)) startSlide(m, p);
    }
  }
}

/** The rival with the ball whom a human without the ball could steal from the front right now (for the mark under his feet, view only). */
/** The rival the arc under him shows: the one a hit would reach. */
export const stealTarget = (m: Match, p: Player): Player | null => hitTarget(m, p, true);

// ------------------------------------------------------------------------------------------------ acts in progress
export function updateAct(m: Match, p: Player, dt: number): { moveScale: number; override: { vx: number; vy: number } | null } {
  const a = p.act!;
  a.t += dt;
  let moveScale = 0, override: { vx: number; vy: number } | null = null;
  switch (a.kind) {
    case 'kick': {
      moveScale = a.t < a.contact! ? 0.3 : 0.5;
      // la palomita: he flies at the ball and slides on after it
      if (a.plan!.dive) { const d = attackDir(p.team), u = Math.max(0, 1 - (a.t - a.contact!) / Math.max(0.01, a.dur - a.contact!)); override = { vx: d * (a.t < a.contact! ? T.dive.lunge : T.dive.slide * u), vy: p.vy * 0.9 }; }
      if (!a.done && a.t >= a.contact!) { a.done = true; resolveKick(m, p, a.plan!); if (p.act !== a) break; }
      if (a.t >= a.dur) { const floor = a.dx ?? 0; endAct(p); if (floor > 0) startGetup(p, floor); }
      break;
    }
    case 'slide': {
      const u = Math.min(1, a.t / a.dur), sp = T.slide.v0 + (T.slide.v1 - T.slide.v0) * u;
      override = { vx: a.dx! * sp, vy: a.dy! * sp * T.yFactor };
      slideContacts(m, p, a);
      if (p.act === a && a.t >= a.dur) { endAct(p); startGetup(p, a.done ? 0.2 : T.slide.miss); }
      break;
    }
    case 'dive': {
      const vy = a.t < 0.35 ? Math.max(-T.gk.diveV, Math.min(T.gk.diveV, ((a.dy ?? p.y) - p.y) / 0.2)) : 0;
      override = { vx: 0, vy };
      if (a.t >= a.dur) { endAct(p); startGetup(p, T.gk.land); }
      break;
    }
    case 'bump': if (a.t >= a.dur) endAct(p); break;
    case 'steal': case 'hit': {
      if (a.air) {
        // the flying kick keeps the way he was going and lands on the first rival it meets; it is over when he touches the ground
        override = { vx: p.vx, vy: p.vy };
        if (!a.done) { const o = flyKickTarget(m, p); if (o) { a.done = true; landBlow(m, p, o); } }
        if (p.act === a && (a.t >= a.dur || (p.z <= 0 && a.t > 0.05))) endAct(p);
        break;
      }
      if (a.t >= a.dur) endAct(p);
      break;
    }
    case 'tumble': {
      // thrown back by the hit: the push fades out in under half a second
      if (a.dx || a.dy) { const k = Math.max(0, 1 - a.t / T.fly.fade); override = { vx: (a.dx ?? 0) * k, vy: (a.dy ?? 0) * k }; }
      if (a.t >= a.dur) endAct(p);
      break;
    }
    default: if (a.t >= a.dur) endAct(p); break;   // stagger, dizzy, getup
  }
  return { moveScale, override };
}

/** Close enough to the goal for a power shot of the air (and not a keeper). */
export const inPowerRange = (m: Match, p: Player): boolean => p.role !== 'gk' && m.phase === 'play' && Math.abs(goalX(p.team) - p.x) <= T.airPower.range;

/** Is the ball this player strikes a pass of a mate that nobody else has touched, close enough to the goal for a power shot? (The one the
 *  pass was for takes a high ball down as it reaches him: it still counts when he had already started to strike it.) */
export function comboReady(m: Match, p: Player): boolean {
  const lp = m.lastPass, b = m.ball;
  if (!lp || lp.team !== p.team || lp.from === p.id || m.t - lp.t >= 3 || !inPowerRange(m, p)) return false;
  return b.lastTouch.player === lp.from || (b.lastTouch.player === p.id && b.prevTouch.player === lp.from && m.t - b.lastTouch.t < 0.6);
}

/** Contact of a kick. If the ball is no longer there the kick is a whiff. */
function resolveKick(m: Match, p: Player, plan: KickPlan): void {
  const b = m.ball;
  const mine = b.owner === p.id;
  let ok = mine;
  if (!ok && b.state === 'free') {
    if (plan.air) ok = Math.abs(b.x - p.x) < T.aerial.dx * aerialK(m, p) + 6 && Math.abs(b.y - p.y) < T.aerial.dy * aerialK(m, p) + 6 && (plan.jumped ? b.z - p.z >= T.jump.lo - 6 && b.z - p.z <= T.jump.hi + 10 : b.z >= T.aerial.zMin - 4 && b.z <= T.aerial.headerZ + 14);
    else ok = Math.abs(b.x - p.x) < T.firstTimeReach + 6 && Math.abs(b.y - p.y) < T.firstTimeReach && b.z < T.ctrl.z;
  }
  if (!ok && plan.kind === 'restart' && b.state === 'dead') ok = true;
  if (!ok) { emit(m, 'whiff', p.x, p.y, p.z, p.id); return; }
  // el remate combinado (Nekketsu): a mate's pass struck in the air at goal is the power shot of whoever strikes it
  // los remates de poder (Nekketsu): a header or an overhead kick at goal is the power shot of whoever strikes it, and so is a volley when
  // the ball is a pass of a mate. The mate's pass (el remate combinado) gives it more chance.
  if (plan.air && plan.target === undefined && (plan.kind === 'header' || plan.kind === 'volley' || plan.kind === 'chilena') && inPowerRange(m, p) && (plan.tx - p.x) * attackDir(p.team) > 0) {
    const combo = comboReady(m, p);
    if (combo || plan.kind !== 'volley') {
      if (combo) emit(m, 'combo', p.x, p.y, p.z, p.id);
      superShot(m, p, (combo ? T.combo.bonus : 0) + (plan.dive ? T.dive.bonus : 0), plan.dive ? 'dive' : plan.kind as 'header' | 'volley' | 'chilena');
      return;
    }
  }
  launch(m, p, plan);
}

/** The free kick: a shot from a dead ball with the aim and the effect that the taker chose. `q` is the quality of the chance the keeper sees (the wall takes the rest). */
export function freeKickShot(m: Match, p: Player, a: { ty: number; speed: number; vz: number; err: number; spin: number; q: number }): void {
  const plan: KickPlan = { kind: 'shot', speed: a.speed, vz: a.vz, tx: goalX(p.team), ty: a.ty, err: a.err, spin: a.spin };
  p.facing = attackDir(p.team); p.dirX = p.facing; p.dirY = 0;
  launch(m, p, plan);
  const sq = m.data.shotQ as { q: number } | undefined; if (sq) sq.q = Math.max(sq.q, a.q);
  m.ball.state = 'free';
}

/** Kicks the ball for a restart (kickoff, throw-in, goal kick, corner) as the taker. `target` is a point, `lob` makes it fly. */
export function restartKick(m: Match, p: Player, tx: number, ty: number, lob: boolean, vz = 0): void {
  const plan: KickPlan = { kind: 'restart', speed: 0, vz, tx, ty, err: lob ? T.lobErr : T.passErr, spin: 0, lob };
  if (Math.abs(tx - p.x) > 4) p.facing = tx > p.x ? 1 : -1;
  launch(m, p, plan);
  m.ball.state = 'free';
}
void GOAL;
