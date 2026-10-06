import { T } from './tuning';
import { ESCAPE } from './field';
import { emptyInput } from './types';
import type { Match, Player } from './state';
import { handleInput, updateAct } from './actions';

const LOCKED = new Set(['stagger', 'tumble', 'dizzy', 'getup', 'celebrate', 'sad', 'hold', 'special']);
const approach = (v: number, t: number, d: number): number => (v < t ? Math.min(t, v + d) : Math.max(t, v - d));

export const isLocked = (p: Player): boolean => LOCKED.has(p.state);
export const hasBall = (m: Match, p: Player): boolean => m.ball.owner === p.id;

/** Moves one player for one fixed step: timers, stamina, input to actions or to movement, integration inside the escape box. */
export function updatePlayer(m: Match, p: Player, dt: number, live: boolean): void {
  p.stateT += dt;
  p.cd.slide = Math.max(0, p.cd.slide - dt); p.cd.steal = Math.max(0, p.cd.steal - dt); p.cd.bump = Math.max(0, p.cd.bump - dt);
  p.immuneT = Math.max(0, p.immuneT - dt); p.noControlT = Math.max(0, p.noControlT - dt);
  const inp = live ? p.input : emptyInput();

  // stamina: drains while sprinting, comes back after a pause, and a drained player waits until 35 before sprinting again
  const wantSprint = inp.sprint && Math.hypot(inp.mx, inp.my) > 0.2 && !p.sprintLock && p.stamina > 0 && !isLocked(p) && (!p.act || p.act.kind === 'kick');
  if (wantSprint) {
    p.stamina = Math.max(0, p.stamina - (T.staminaMax / p.stats.stamina) * dt); p.noSprintT = 0;
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

  // horizontal motion
  const locked = isLocked(p) || !!override;
  let tvx = 0, tvy = 0, sprinting = false;
  if (override) { p.vx = override.vx; p.vy = override.vy; }
  else if (!locked && moveScale > 0) {
    let mx = inp.mx, my = inp.my;
    const mag = Math.hypot(mx, my);
    if (mag > 1) { mx /= mag; my /= mag; }
    sprinting = wantSprint && mag > 0.2;
    const speed = p.stats.run * (sprinting ? p.stats.sprint : 1) * (hasBall(m, p) ? T.carrySpeed : 1) * p.speedMult * moveScale;
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

