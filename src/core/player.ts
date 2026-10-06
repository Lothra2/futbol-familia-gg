import { T } from './tuning';
import { ESCAPE, ownGoalX } from './field';
import { emptyInput } from './types';
import type { Match, Player } from './state';
import { handleInput, playerById, updateAct } from './actions';

const LOCKED = new Set(['stagger', 'tumble', 'dizzy', 'getup', 'celebrate', 'sad', 'hold', 'special']);
const approach = (v: number, t: number, d: number): number => (v < t ? Math.min(t, v + d) : Math.max(t, v - d));

export const isLocked = (p: Player): boolean => LOCKED.has(p.state);
export const hasBall = (m: Match, p: Player): boolean => m.ball.owner === p.id;

/** Moves one player for one fixed step: timers, stamina, input to actions or to movement, integration inside the escape box. */
export function updatePlayer(m: Match, p: Player, dt: number, live: boolean): void {
  p.stateT += dt;
  p.cd.slide = Math.max(0, p.cd.slide - dt); p.cd.steal = Math.max(0, p.cd.steal - dt); p.cd.bump = Math.max(0, p.cd.bump - dt);
  p.immuneT = Math.max(0, p.immuneT - dt); p.noControlT = Math.max(0, p.noControlT - dt);
  if (p.slowT) p.slowT = Math.max(0, p.slowT - dt);
  const inp = live ? p.input : emptyInput();

  // stamina: drains while sprinting, comes back after a pause, and a drained player waits until 35 before sprinting again
  // easy controls have no Sprint button: pushing the stick past 85 % for 0.3 s runs fast by itself, using the stamina at half the rate
  const easyHuman = p.control === 'human' && p.controls === 'easy';
  if (easyHuman && Math.hypot(inp.mx, inp.my) > T.easy.autoStick) p.autoT = (p.autoT ?? 0) + dt; else p.autoT = 0;
  const auto = easyHuman && (p.autoT ?? 0) >= T.easy.autoAfter;
  const wantSprint = (inp.sprint || auto) && Math.hypot(inp.mx, inp.my) > 0.2 && !p.sprintLock && p.stamina > 0 && !isLocked(p) && (!p.act || p.act.kind === 'kick');
  if (wantSprint) {
    p.stamina = Math.max(0, p.stamina - (T.staminaMax / p.stats.stamina) * dt * (auto && !inp.sprint ? T.easy.autoDrain : 1)); p.noSprintT = 0;
    if (p.stamina <= 0) p.sprintLock = true;
  } else {
    p.noSprintT += dt;
    if (p.noSprintT >= T.staminaWait) p.stamina = Math.min(T.staminaMax, p.stamina + T.staminaRecover * dt);
    if (p.sprintLock && p.stamina >= T.staminaUnlock) p.sprintLock = false;
  }

  // actions in progress (kicks, slides, falls) drive the player; otherwise input may start one
  let moveScale = 1, override: { vx: number; vy: number } | null = null;
  if (p.act) { const r = updateAct(m, p, dt); moveScale = r.moveScale; override = r.override; }
  else if (live && !isLocked(p)) { handleInput(m, p, dt); if (p.act) { const r = updateAct(m, p, 0); moveScale = r.moveScale; override = r.override; } }
  if (p.act || isLocked(p) || !live) { p.shoot.down = false; p.pass.down = false; }

  // vertical motion (headers and the bicycle kick leave the ground)
  if (p.z > 0 || p.vz !== 0) {
    p.vz -= T.jumpG * dt; p.z += p.vz * dt;
    if (p.z <= 0) { p.z = 0; p.vz = 0; }
  }

  // contain: a human with full controls who holds Pass (past the tap) without the ball stays between the rival who has it and his own goal, a bit slower than a sprint
  const carrier = playerById(m, m.ball.owner);
  let containing = false, cmx = 0, cmy = 0;
  if (live && p.control === 'human' && p.controls === 'full' && p.pass.down && p.pass.t >= T.contain.tapMax && !p.act && !isLocked(p) && m.phase === 'play'
    && m.ball.state === 'owned' && carrier && carrier.team !== p.team && Math.hypot(carrier.x - p.x, carrier.y - p.y) < 140) {
    containing = true;
    const gx = ownGoalX(p.team) - carrier.x, gy = 80 - carrier.y, gl = Math.hypot(gx, gy) || 1;
    const dx = carrier.x + (gx / gl) * T.contain.dist - p.x, dy = (carrier.y + (gy / gl) * T.contain.dist - p.y) / T.yFactor, d = Math.hypot(dx, dy);
    if (d > 1.5) { const k = Math.min(1, d / 14); cmx = (dx / d) * k; cmy = (dy / d) * k; }
    p.facing = carrier.x >= p.x ? 1 : -1;
    carrier.slowT = 0.15;
    p.containT = (p.containT ?? 0) + dt;
  } else {
    // he held Pass to contain and took the ball: the release of that same press must not throw a pass
    if ((p.containT ?? 0) > 0 && hasBall(m, p)) { p.pass.down = false; p.pass.t = 0; }
    p.containT = 0;
  }

  // horizontal motion
  const locked = isLocked(p) || !!override;
  let tvx = 0, tvy = 0, sprinting = false;
  if (override) { p.vx = override.vx; p.vy = override.vy; }
  else if (!locked && moveScale > 0) {
    let mx = containing ? cmx : inp.mx, my = containing ? cmy : inp.my;
    const mag = Math.hypot(mx, my);
    if (mag > 1) { mx /= mag; my /= mag; }
    sprinting = wantSprint && mag > 0.2;
    const speed = p.stats.run * (sprinting ? p.stats.sprint : 1) * (hasBall(m, p) ? T.carrySpeed : 1) * p.speedMult * moveScale * (containing ? T.contain.speed : 1) * (p.slowT ? T.contain.slow : 1);
    tvx = mx * speed; tvy = my * speed * T.yFactor;
    if (Math.abs(mx) > 0.2) p.facing = mx > 0 ? 1 : -1;
    if (mag > 0.2) { const n = Math.hypot(mx, my); p.dirX = mx / n; p.dirY = my / n; }
  }
  if (!override) {
    const ax = (Math.abs(tvx) > Math.abs(p.vx) && Math.sign(tvx) === Math.sign(p.vx || tvx) ? T.accel : T.brake) * dt;
    const ay = (Math.abs(tvy) > Math.abs(p.vy) && Math.sign(tvy) === Math.sign(p.vy || tvy) ? T.accel : T.brake) * dt;
    p.vx = approach(p.vx, tvx, ax); p.vy = approach(p.vy, tvy, ay);
  }
  p.x = Math.max(ESCAPE.x0, Math.min(ESCAPE.x1, p.x + p.vx * dt));
  p.y = Math.max(ESCAPE.y0, Math.min(ESCAPE.y1, p.y + p.vy * dt));

  // visible state, read by the view and by tests
  if (!p.act || p.act.kind === 'kick') {
    if (p.act?.kind === 'kick') p.state = 'kick';
    else if (!isLocked(p)) { const sp = Math.hypot(p.vx, p.vy); p.state = sp < 8 ? 'idle' : sprinting ? 'sprint' : 'run'; }
  }
}

