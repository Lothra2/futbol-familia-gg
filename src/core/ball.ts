import { T } from './tuning';
import { GOAL, PITCH } from './field';
import type { Ball, Team } from './state';

export const newBall = (): Ball => ({
  x: PITCH.w / 2, y: PITCH.d / 2, z: 0, vx: 0, vy: 0, vz: 0, spin: 0, roll: 0, state: 'dead', owner: null,
  lastTouch: { team: null, player: null, t: 0 }, prevTouch: { team: null, player: null, t: 0 }, inNet: false, scored: null,
});

const C = T.rollA / T.rollB;   // rolling friction: dv/dt = -(rollA + rollB * v), solved exactly below

/** Distance a rolling ball covers while its speed falls from v0 to v. Closed form of the rolling law. */
export function rollDistance(v0: number, v: number): number {
  if (v0 <= v) return 0;
  const F = (u: number): number => u / T.rollB - (T.rollA / (T.rollB * T.rollB)) * Math.log(T.rollA + T.rollB * u);
  return F(v0) - F(v);
}
/** Launch speed so a ball kicked along the ground covers `d` px and arrives with speed `vEnd` (12 steps of bisection, same law as the ball). */
export function speedToReach(d: number, vEnd: number = T.passEnd): number {
  let lo = vEnd, hi = 900;
  for (let i = 0; i < 12; i++) { const mid = (lo + hi) / 2; if (rollDistance(mid, vEnd) < d) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}
/** Horizontal speed and vertical speed for a lob that lands `d` px away, with the air drag of the ball compensated. */
export function lobLaunch(d: number): { v: number; vz: number; t: number } {
  const t = Math.max(0.35, d / T.lobSpeed);
  const vz = (T.gravity * t) / 2;
  const k = T.airDrag;
  const v = (d * k) / (1 - Math.exp(-k * t));
  return { v, vz, t };
}

export interface BallHooks { post(x: number, y: number, z: number, v: number): void; bar(x: number, y: number, z: number, v: number): void; bounce(x: number, y: number, v: number): void }

/** Collision of the ball with the goal frame at x0 (posts are vertical cylinders, the crossbar is horizontal along y). */
function frame(b: Ball, x0: number, hooks?: BallHooks): void {
  const R = T.ballR + T.postR;
  if (b.z < T.postH + T.ballR) {
    for (const py of [GOAL.y0, GOAL.y1]) {
      const dx = b.x - x0, dy = b.y - py, d = Math.hypot(dx, dy);
      if (d < R) {
        const nx = d > 1e-6 ? dx / d : 1, ny = d > 1e-6 ? dy / d : 0;
        const vn = b.vx * nx + b.vy * ny;
        b.x = x0 + nx * R; b.y = py + ny * R;
        if (vn < 0) {
          const sp = Math.hypot(b.vx, b.vy);
          b.vx -= (1 + T.postE) * vn * nx; b.vy -= (1 + T.postE) * vn * ny;
          hooks?.post(b.x, b.y, b.z, sp);
        }
      }
    }
  }
  if (b.y > GOAL.y0 && b.y < GOAL.y1) {
    const dx = b.x - x0, dz = b.z - T.barZ, d = Math.hypot(dx, dz);
    if (d < R) {
      const nx = d > 1e-6 ? dx / d : 0, nz = d > 1e-6 ? dz / d : 1;
      const vn = b.vx * nx + b.vz * nz;
      b.x = x0 + nx * R; b.z = T.barZ + nz * R;
      if (vn < 0) {
        const sp = Math.hypot(b.vx, b.vz);
        b.vx -= (1 + T.postE) * vn * nx; b.vz -= (1 + T.postE) * vn * nz;
        hooks?.bar(b.x, b.y, b.z, sp);
      }
    }
  }
}

/** One physical substep of a free ball. */
function sub(b: Ball, dt: number, hooks?: BallHooks): void {
  const px = b.x, py = b.y, pz = b.z;
  const air = b.z > 0 || b.vz !== 0;
  if (air) { const f = Math.exp(-T.airDrag * dt); b.vx *= f; b.vy *= f; }
  else {
    const s = Math.hypot(b.vx, b.vy);
    if (s > 0) {
      const n = (s + C) * Math.exp(-T.rollB * dt) - C;
      if (n <= 0) { b.vx = b.vy = 0; } else { b.vx *= n / s; b.vy *= n / s; }
    }
  }
  if (b.spin !== 0) {
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > 20) b.vy += b.spin * T.spinAccel * Math.min(1, sp / 300) * dt;   // the effect bites less on a slow ball
    b.spin *= Math.exp(-T.spinDecay * dt);
    if (Math.abs(b.spin) < 0.01) b.spin = 0;
  }
  if (air) { b.vz -= T.gravity * dt; }
  b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
  b.roll += Math.hypot(b.vx, b.vy) * dt;
  if (b.z <= 0) {
    b.z = 0;
    if (b.vz < 0) {
      const nv = -b.vz * T.bounceV;
      const impact = Math.hypot(b.vx, b.vy);
      b.vx *= T.bounceH; b.vy *= T.bounceH;
      if (nv < T.bounceMin) b.vz = 0; else { b.vz = nv; hooks?.bounce(b.x, b.y, impact); }
    }
  }
  // goal frame, then the net
  if (!b.inNet) { frame(b, 0, hooks); frame(b, PITCH.w, hooks); }
  for (const [x0, team] of [[0, 1], [PITCH.w, 0]] as [number, Team][]) {
    const goalSide = team === 0 ? 1 : -1;   // crossing x0 going in direction goalSide scores for `team`
    if (!b.inNet && ((px - x0) * goalSide < 0) && ((b.x - x0) * goalSide >= 0)) {
      const f = (x0 - px) / (b.x - px || 1);
      const yc = py + (b.y - py) * f, zc = pz + (b.z - pz) * f;
      if (yc >= GOAL.y0 + T.ballR && yc <= GOAL.y1 - T.ballR && zc < T.barZ - T.ballR) { b.inNet = true; b.scored = team; }
    }
    if (b.inNet && b.scored === team) {
      // the net holds the ball: it loses almost all its speed and cannot leave through the sides, back or top
      b.vx *= T.netDamp; b.vy *= T.netDamp; b.vz *= T.netDamp;
      const lim = team === 0 ? PITCH.w + GOAL.net : -GOAL.net;
      if (team === 0 ? b.x > lim : b.x < lim) { b.x = lim; b.vx = 0; }
      b.y = Math.max(GOAL.y0 + T.ballR, Math.min(GOAL.y1 - T.ballR, b.y));
      if (b.z > T.barZ - T.ballR) { b.z = T.barZ - T.ballR; b.vz = Math.min(0, b.vz); }
    }
  }
}

/** Integrates a free ball for dt seconds with enough substeps that the fastest ball cannot jump through a post (6 px = a post and a ball). */
export function stepBall(b: Ball, dt: number, hooks?: BallHooks): void {
  if (b.state !== 'free') return;
  const speed = Math.hypot(b.vx, b.vy, b.vz);
  if (speed > T.ballMax * 1.5) { const k = (T.ballMax * 1.5) / speed; b.vx *= k; b.vy *= k; b.vz *= k; }
  const n = Math.max(1, Math.min(8, Math.ceil((speed * dt) / 2.5)));
  for (let i = 0; i < n; i++) sub(b, dt / n, hooks);
  const h = Math.hypot(b.vx, b.vy);
  if (h > T.ballMax) { b.vx *= T.ballMax / h; b.vy *= T.ballMax / h; }
}
