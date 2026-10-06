import { T } from './tuning';
import { ESCAPE, ownGoalX } from './field';
import { addBar } from './specials';
import { emit } from './events';
import { checkBump, dropBall, playerById, setTouch } from './actions';
import type { Match, Player } from './state';

const NO_CONTROL = new Set(['stagger', 'tumble', 'dizzy', 'getup', 'celebrate', 'sad', 'slide', 'dive', 'hold', 'special']);
const isEasy = (p: Player): boolean => p.control === 'human' && p.controls === 'easy';

/** Who gets a free ball, who loses it, and where the ball sits while it is carried (GAME_DESIGN 6.3). */
export function updatePossession(m: Match, dt: number): void {
  const b = m.ball;
  if (b.state === 'free' && m.phase === 'play' && !b.inNet) { magnet(m, dt); tryControl(m); }
  if (b.state === 'held') {
    const k = playerById(m, b.owner);
    if (!k) { b.state = 'free'; b.owner = null; return; }
    k.holdT += dt;
    b.x = k.x + k.dirX * 6; b.y = k.y; b.z = 14; b.vx = b.vy = b.vz = 0;
    return;
  }
  if (m.phase === 'play') for (const p of m.players) checkBump(m, p);
  if (b.owner !== null) {
    const ow = playerById(m, b.owner);
    if (ow && m.data.holdTeam !== ow.team) { m.data.holdTeam = ow.team; m.data.holdSince = m.t; }
  }
  if (b.state === 'owned') {
    const o = playerById(m, b.owner);
    if (!o) { b.state = 'free'; b.owner = null; return; }
    if (o.state === 'tumble' || o.state === 'stagger') { dropBall(m, o); return; }
    o.holdT += dt;
    const sp = Math.hypot(o.vx, o.vy);
    const easy = isEasy(o);
    const base = sp < 50 ? (easy ? T.carryOff.easyWalk : T.carryOff.walk) : o.state === 'sprint' ? (easy ? T.carryOff.easySprint : T.carryOff.sprint) : (easy ? T.carryOff.easyRun : T.carryOff.run);
    const off = base / o.stats.control;
    b.x = Math.max(ESCAPE.x0, Math.min(ESCAPE.x1, o.x + o.dirX * off));
    b.y = Math.max(ESCAPE.y0, Math.min(ESCAPE.y1, o.y + o.dirY * off * T.yFactor));
    b.z = o.z; b.vx = o.vx; b.vy = o.vy; b.vz = 0; b.spin = 0; b.roll += sp * dt;
  }
}

/** Easy controls: a slow loose ball near the child curves towards her (60 px/s2 inside 30 px), so it does not slip past a foot that is almost there. */
function magnet(m: Match, dt: number): void {
  const b = m.ball;
  if (b.z >= T.ctrl.z || Math.hypot(b.vx, b.vy) > T.easy.magnetSpeed) return;
  for (const p of m.players) {
    if (!isEasy(p) || NO_CONTROL.has(p.state) || p.noControlT > 0) continue;
    if (b.lastTouch.player === p.id && m.t - b.lastTouch.t < 0.5) continue;   // her own kick is not pulled back
    const dx = p.x - b.x, dy = p.y - b.y, d = Math.hypot(dx, dy);
    if (d > T.easy.magnetR || d < 1) continue;
    b.vx += (dx / d) * T.easy.magnetA * dt; b.vy += (dy / d) * T.easy.magnetA * dt;
    return;
  }
}

function tryControl(m: Match): void {
  const b = m.ball;
  let best: Player | null = null, bd = Infinity;
  for (const p of m.players) {
    if (NO_CONTROL.has(p.state) || p.noControlT > 0) continue;
    if (p.role === 'gk' && Math.hypot(b.vx, b.vy) > T.gk.looseV) continue;   // a keeper does not stop a fast ball by touching it: ai/keeper.ts rolls the save
    const easy = isEasy(p);
    // the receiver of a pass can take it down from a higher ball (chest height), so a lob settles instead of bouncing over him
    const lp = m.lastPass;
    const target = !!lp && lp.to === p.id && lp.team === p.team && m.t - lp.t < 4 && b.vz <= 0;
    if (b.z >= (target ? T.ctrl.zTarget : T.ctrl.z)) continue;
    const dx = Math.abs(b.x - p.x), dy = Math.abs(b.y - p.y);
    if (dx >= (easy ? T.ctrl.easyDx : T.ctrl.dx) || dy >= (easy ? T.ctrl.easyDy : T.ctrl.dy)) continue;
    const d = dx + dy;
    if (d < bd) { bd = d; best = p; }
  }
  if (!best) return;
  const sp = Math.hypot(b.vx, b.vy);
  if (sp > (isEasy(best) ? T.ctrl.easyMaxSpeed : T.ctrl.maxSpeed)) {
    // too fast to control: it bounces off the body
    b.vx *= T.deflectVx; b.vy = m.rng.range(-T.deflectVy, T.deflectVy);
    setTouch(m, best); best.noControlT = 0.15;
    emit(m, 'deflect', b.x, b.y, b.z, best.id, sp);
    return;
  }
  const lp = m.lastPass;
  if (lp && !lp.done && lp.to === best.id && lp.team === best.team) { lp.done = true; addBar(m, best.team, T.bar.pass); }
  if (best.role === 'gk' && Math.abs(b.x - ownGoalX(best.team)) < T.gk.area) {
    b.state = 'held'; b.owner = best.id; b.vx = b.vy = b.vz = 0; best.state = 'hold'; best.immuneT = 99; best.holdT = 0; best.ai.armedAt = 0; best.vx = best.vy = 0;
    setTouch(m, best); emit(m, 'catch', b.x, b.y, 0, best.id);
    return;
  }
  b.state = 'owned'; b.owner = best.id; b.inNet = false; best.immuneT = T.immune; best.holdT = 0;
  b.vx = b.vy = b.vz = 0;
  setTouch(m, best);
  emit(m, 'control', b.x, b.y, 0, best.id);
}
