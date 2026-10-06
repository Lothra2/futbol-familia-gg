import { T } from './tuning';
import { ESCAPE, GOAL, PITCH, attackDir, goalX, ownGoalX } from './field';
import { lobLaunch, speedToReach } from './ball';
import { emit } from './events';
import { addBar } from './specials';
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
export const startTumble = (m: Match, p: Player, dur: number): void => { dropBall(m, p); begin(p, { kind: 'tumble', t: 0, dur }, 'tumble'); p.holdT = 0; };
export const startDizzy = (p: Player, dur: number): void => begin(p, { kind: 'dizzy', t: 0, dur }, 'dizzy');
export const startGetup = (p: Player, dur: number): void => begin(p, { kind: 'getup', t: 0, dur }, 'getup');
/** A keeper stretches towards y. The save itself is rolled by ai/keeper.ts; the dive moves him and plays the pose. */
export const startDive = (m: Match, p: Player, ty: number): void => { begin(p, { kind: 'dive', t: 0, dur: T.gk.diveT, dy: ty }, 'dive'); emit(m, 'dive', p.x, p.y, 0, p.id); };

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
  else v = Math.min(T.kickCap, plan.speed * (plan.assist ? 1.1 : 1) * p.stats.power);
  if ((plan.kind === 'pass' || plan.kind === 'chip') && !plan.vaselina) { m.lastPass = { from: p.id, to: plan.target ?? -1, t: m.t, team: p.team }; p.stats2.passes++; if (plan.kind === 'chip') p.stats2.chips++; }
  if (plan.kind === 'shot' || plan.kind === 'volley' || plan.kind === 'chilena' || plan.vaselina || (plan.kind === 'header' && plan.target === undefined)) {
    p.stats2.shots++;
    m.data.shotQ = { q: shotQuality(m, p, plan.ty, !!plan.first), first: !!plan.first, team: p.team, t: m.t };   // read by the keeper when he rolls the save
    if (Math.abs(goalX(p.team) - b.x) < 320) { m.stats.shots[p.team]++; addBar(m, p.team, plan.ty >= 58 && plan.ty <= 102 ? T.bar.shot : T.bar.shotOff); }
  }
  releaseBall(m, p, ux * v, uy * v, vz, plan.spin, (plan.kind === 'pass' || plan.kind === 'chip') && !plan.vaselina ? 'pass' : 'kick');
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
        s = fwd / 200 - Math.abs(q.y - p.y) / 400 - near - cut - (d < 60 ? 0.3 : 0) - Math.max(0, d - 160) / 300;
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
    return { ty: gk && gk.y < 80 ? 92 : 68, spin: 0 };
  }
  // the aim follows the stick continuously: 80 +- 22 px (the posts are at 56 and 104), a small dead zone keeps the centre
  return { ty: Math.abs(sy) < 0.15 ? 80 : clamp(80 + clamp(sy, -1, 1) * T.chance.aim, 58, 102), spin: 0 };
}

/** A tapped shot by a person with the keeper off his line and close: a chip over him (a shot for the stats, the bar and the keeper). */
function vaselinaPlan(m: Match, p: Player): KickPlan | null {
  if (p.control !== 'human') return null;
  const gk = m.players.find((q) => q.team !== p.team && q.role === 'gk'), gx = goalX(p.team), dir = attackDir(p.team);
  if (!gk || Math.abs(gk.x - gx) <= T.vasel.out || Math.hypot(gk.x - p.x, gk.y - p.y) >= T.vasel.near || Math.abs(gx - m.ball.x) >= T.vasel.range) return null;
  return { kind: 'chip', speed: 0, vz: 0, tx: gx + dir * 10, ty: clamp(80 + clamp(p.input.my, -1, 1) * T.vasel.up, 60, 100), err: 4, spin: 0, lob: true, vaselina: true };
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
  const spot = { x: gx - dir * T.cross.post, y: p.y < 80 ? 80 + T.cross.far : 80 - T.cross.far };
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
  if (plan.air && (plan.kind === 'header' || plan.kind === 'chilena')) p.vz = T.jumpV * (plan.kind === 'chilena' ? 0.9 : 1);
  begin(p, { kind: 'kick', t: 0, dur: prep + T.kickRecover, contact: prep, plan, sub: plan.kind }, 'kick');
  p.act!.dx = floor;
  p.shoot.down = false; p.pass.down = false;
}

const PREP: Record<KickKind, number> = { pass: T.passPrep, chip: T.passPrep, shot: T.shotPrep, volley: T.volleyPrep, header: T.headerPrep, chilena: T.chilenaPrep, restart: T.passPrep };

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

function planAerial(m: Match, p: Player, zone: 'volley' | 'header', viaPass: boolean): { plan: KickPlan; prep: number; floor: number } {
  const gx = goalX(p.team), dir = attackDir(p.team);
  const { ty } = shotTarget(m, p, false);
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
        startTumble(m, o, T.slide.tumble);
        emit(m, 'slidehit', o.x, o.y, 0, o.id);
        // a foul: the rival who carried the ball is brought down close to the goal of the one who slides (rules.ts gives the free kick when the step ends)
        if (!m.training && m.t - ((m.data.fkAt as number) ?? -99) > T.free.cd && Math.abs(o.x - ownGoalX(p.team)) < T.free.zone && (m.ball.owner === o.id || Math.hypot(m.ball.x - o.x, m.ball.y - o.y) < T.free.ballNear)) m.data.foul = { team: o.team, x: o.x, y: o.y, who: o.id };
        startDizzy(p, T.slide.dizzy);
        return;
      }
    }
  }
}

/** Frontal steal: the rival with the ball is in reach in front. Returns whether an attempt was made. */
export function tryFrontSteal(m: Match, p: Player, slack = false): boolean {
  if (p.cd.steal > 0) return false;
  const b = m.ball, c = playerById(m, b.owner);
  if (!c || c.team === p.team || c.immuneT > 0) return false;
  const fx = (c.x - p.x) * p.facing;
  if (fx < -2 || fx > T.steal.reach + (slack ? T.steal.slack.x : 0) || Math.abs(c.y - p.y) > T.steal.dy + (slack ? T.steal.slack.y : 0)) return false;
  p.cd.steal = T.steal.cd;
  const easyCarrier = c.control === 'human' && c.controls === 'easy' ? T.easy.stolen : 1;   // the ball sticks more to a child on easy controls
  const contained = (p.containT ?? 0) >= T.contain.after ? T.contain.stealBonus : 1;           // after half a second of holding him the steal is likelier
  if (m.rng.chance(Math.min(0.95, T.steal.p * (p.stats.steal ?? 1) * c.stats.stolen * easyCarrier * contained))) {
    dropBall(m, c); startStagger(m, c, T.steal.fail);
    b.owner = p.id; b.state = 'owned'; p.immuneT = T.immune; p.stats2.steals++; setTouch(m, p); addBar(m, p.team, T.bar.steal + (contained > 1 ? T.bar.containSteal : 0));
    emit(m, 'steal', b.x, b.y, 0, p.id);
  } else {
    startStagger(m, p, T.steal.fail);
    emit(m, 'whiff', p.x, p.y, 0, p.id);
  }
  return true;
}

/** A sprinting player runs into the rival who carries the ball. */
export function checkBump(m: Match, p: Player): void {
  if (p.state !== 'sprint' || p.cd.bump > 0 || m.phase !== 'play') return;
  const c = playerById(m, m.ball.owner);
  if (!c || c.team === p.team || c.immuneT > 0 || LOCK.has(c.state)) return;
  const dx = c.x - p.x, dy = c.y - p.y;
  if (Math.abs(dx) > T.bump.dx || Math.abs(dy) > T.bump.dy || dx * p.vx + dy * p.vy <= 0) return;
  p.cd.bump = T.bump.cd;
  emit(m, 'bump', c.x, c.y, 0, p.id);
  if (m.rng.chance(T.bump.p * p.stats.resist / c.stats.resist)) {
    const n = Math.hypot(p.vx, p.vy) || 1;
    dropBall(m, c, (p.vx / n) * 70, (p.vy / n) * 70 + m.rng.range(-30, 30), 0);
    m.ball.state = 'free'; setTouch(m, p);
    startStagger(m, c, T.bump.victim); c.holdT = 0;
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
      if (toGoal < 240 && Math.abs(p.y - 80) < 60) { startKick(m, p, planShot(m, p, 0, true), T.shotPrep); return; }
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
    tryFrontSteal(m, p);
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
    if (p.control === 'ai') { if (inp.slide) startSlide(m, p); else tryFrontSteal(m, p); }
    else {
      // "close steals, far slides": a rival with the ball right in front is taken from the front (never with a slide), anywhere else it is a slide
      const c = playerById(m, b.owner), fx = c ? (c.x - p.x) * p.facing : 0;
      if (c && c.team !== p.team && c.immuneT <= 0 && fx >= -2 && fx <= T.steal.reach + T.steal.slack.x && Math.abs(c.y - p.y) <= T.steal.dy + T.steal.slack.y) tryFrontSteal(m, p, true);
      else startSlide(m, p);
    }
  }
}

/** The rival with the ball whom a human without the ball could steal from the front right now (for the mark under his feet, view only). */
export function stealTarget(m: Match, p: Player): Player | null {
  if (p.cd.steal > 0 || m.phase !== 'play' || LOCK.has(p.state) || p.act) return null;
  const c = playerById(m, m.ball.owner);
  if (!c || c.team === p.team || c.immuneT > 0) return null;
  const fx = (c.x - p.x) * p.facing;
  return fx >= -2 && fx <= T.steal.reach + T.steal.slack.x && Math.abs(c.y - p.y) <= T.steal.dy + T.steal.slack.y ? c : null;
}

// ------------------------------------------------------------------------------------------------ acts in progress
export function updateAct(m: Match, p: Player, dt: number): { moveScale: number; override: { vx: number; vy: number } | null } {
  const a = p.act!;
  a.t += dt;
  let moveScale = 0, override: { vx: number; vy: number } | null = null;
  switch (a.kind) {
    case 'kick': {
      moveScale = a.t < a.contact! ? 0.3 : 0.5;
      if (!a.done && a.t >= a.contact!) { a.done = true; resolveKick(m, p, a.plan!); }
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
    case 'steal': if (a.t >= a.dur) endAct(p); break;
    default: if (a.t >= a.dur) endAct(p); break;   // stagger, tumble, dizzy, getup
  }
  return { moveScale, override };
}

/** Contact of a kick. If the ball is no longer there the kick is a whiff. */
function resolveKick(m: Match, p: Player, plan: KickPlan): void {
  const b = m.ball;
  const mine = b.owner === p.id;
  let ok = mine;
  if (!ok && b.state === 'free') {
    if (plan.air) ok = Math.abs(b.x - p.x) < T.aerial.dx * aerialK(m, p) + 6 && Math.abs(b.y - p.y) < T.aerial.dy * aerialK(m, p) + 6 && b.z >= T.aerial.zMin - 4 && b.z <= T.aerial.headerZ + 14;
    else ok = Math.abs(b.x - p.x) < T.firstTimeReach + 6 && Math.abs(b.y - p.y) < T.firstTimeReach && b.z < T.ctrl.z;
  }
  if (!ok && plan.kind === 'restart' && b.state === 'dead') ok = true;
  if (!ok) { emit(m, 'whiff', p.x, p.y, p.z, p.id); return; }
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
