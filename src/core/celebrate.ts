import { T } from './tuning';
import { PITCH, attackDir } from './field';
import { emit } from './events';
import type { Match, Player, Team } from './state';

/** What a player does while his team celebrates a goal (the view picks the animation from it). */
export type CeleMove = 'run' | 'flip' | 'slide' | 'spin' | 'pump' | 'hop' | 'zoom' | 'prance' | 'pose' | 'wave' | 'burla';
/** The gestures a person can make while her player celebrates (Nekketsu Soccer League: the celebration is played, not watched). */
export const GESTURES = ['pump', 'wave', 'flip', 'burla'] as const;
/** The part of each player in the celebration: the scorer runs to his spot and does his thing, his mates run to him and jump round him,
 *  and the keeper celebrates in his goal (Thor runs in circles). `t` is the time in the current move, `n` his place in the ring. */
export interface Cele {
  role: 'star' | 'join' | 'keeper'; x: number; y: number; n: number; move: CeleMove; t: number; style: number;
  /** A person took him over (she moved the stick or pressed a button): he goes where she says and does her gestures. `idle`: s since her
   *  last input; `did`: which gestures she has made (a bit each, in the order of GESTURES). */
  free?: boolean; idle?: number; did?: number; next?: (typeof GESTURES)[number] | null;
}

const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
/** Speed of the run to the spot, the time the scorer runs before his move, how long the move lasts, and the lift of the jumps. */
export const CELE = { run: 150, join: 175, runT: 0.8, moveT: 0.55, flipV: 235, pumpV: 150, hopV: 135, slideV: 190, ring: 24, zoomR: 15, zoomW: 9,
  /** The celebration of a person: the speed of her proud walk, how long a wave and the pose at the camera last, how long she may stand before
   *  he jumps by himself, how long after her last gesture the celebration is kept going, and its longest. */
  prance: 82, waveT: 0.85, burlaT: 0.95, lazy: 0.9, hold: 1.4, max: 5.6 } as const;

/** Starts the celebration of a goal of `team` (called when the goal is given). Whoever scored is the star; an own goal stars the nearest forward. */
export function startCelebration(m: Match, team: Team, scorer: number | null): void {
  const dir = attackDir(team), b = m.ball;
  const mine = m.players.filter((p) => p.team === team);
  let star = mine.find((p) => p.id === scorer && p.role !== 'gk');
  if (!star) star = mine.filter((p) => p.role !== 'gk').sort((a, c) => Math.hypot(a.x - b.x, a.y - b.y) - Math.hypot(c.x - b.x, c.y - b.y))[0];
  // his spot: back from the goal he scored in and towards the camera, where everybody can come to him
  const sx = clamp(star.x - dir * 56, 40, PITCH.w - 40), sy = clamp(star.y + (star.y < PITCH.d * 0.7 ? 34 : -30), 30, PITCH.d - 26);
  let n = 0;
  for (const p of m.players) {
    if (p.team !== team) { p.cele = null; continue; }
    if (p === star) p.cele = { role: 'star', x: sx, y: sy, n: 0, move: 'run', t: 0, style: p.id % 3 };
    else if (p.role === 'gk') p.cele = { role: 'keeper', x: p.x, y: p.y, n: 0, move: p.charId === 'thor' ? 'zoom' : 'hop', t: 0, style: 0 };
    else { p.cele = { role: 'join', x: sx, y: sy, n, move: 'run', t: 0, style: 0 }; n++; }
  }
}

function runTo(p: Player, x: number, y: number, v: number): boolean {
  const dx = x - p.x, dy = y - p.y, d = Math.hypot(dx, dy);
  if (d < 5) { p.vx = p.vy = 0; return true; }
  // a little more than the speed wanted: the player brakes a bit every step (player.ts)
  p.vx = (dx / d) * (v + 15); p.vy = (dy / d) * (v + 15);
  p.dirX = dx / d; p.dirY = dy / d; if (Math.abs(dx) > 2) p.facing = dx > 0 ? 1 : -1;
  return false;
}
const hop = (p: Player, v: number): void => { if (p.z <= 0 && p.vz === 0) { p.vz = v; p.z = 0.5; } };

/** One step of the celebration: moves whoever celebrates (the core only sets speeds and jumps; player.ts integrates them). */
export function stepCelebration(m: Match, dt: number): void {
  const t = m.phaseT;
  const star = m.players.find((p) => p.cele?.role === 'star');
  for (const p of m.players) {
    const c = p.cele;
    if (!c || p.state !== 'celebrate') continue;
    c.t += dt;
    // a person celebrates her own way (the keeper is always of the AI): from her first touch of the stick or of a button he is hers
    if (p.control === 'human' && p.role !== 'gk') {
      const f = p.input, pressed = f.shootPressed || f.passPressed || f.specialPressed || !!f.jumpPressed;
      // (the stick only counts after a moment: she was running when the ball went in)
      if ((t >= 0.2 && pressed) || (t >= 0.6 && Math.hypot(f.mx, f.my) > 0.3)) { if (!c.free) { c.free = true; c.did = c.did ?? 0; if (p.z <= 0 && p.vz === 0) { c.move = 'prance'; c.t = 0; } } c.idle = 0; }   // (caught in the air, he finishes his jump first)
      if (c.free) { stepFree(m, p, c, dt); continue; }
    }
    if (c.role === 'star') {
      if (c.move === 'run') {
        if (runTo(p, c.x, c.y, CELE.run) || t >= CELE.runT) {
          // his move: a somersault, a slide on the knees or a spinning jump
          c.move = c.style === 0 ? 'flip' : c.style === 1 ? 'slide' : 'spin'; c.t = 0;
          if (c.move !== 'slide') { p.vx *= 0.3; p.vy *= 0.3; hop(p, CELE.flipV); }
          emit(m, 'celemove', p.x, p.y, 0, p.id, c.style);
        }
      } else if (c.move === 'slide') {
        const k = Math.max(0, 1 - c.t / CELE.moveT), d = Math.hypot(p.dirX, p.dirY) || 1;
        p.vx = (p.dirX / d) * CELE.slideV * k; p.vy = (p.dirY / d) * CELE.slideV * k * T.yFactor;
        if (c.t >= CELE.moveT) { c.move = 'pump'; c.t = 0; }
      } else if (c.move === 'flip' || c.move === 'spin') {
        p.vx *= 0.9; p.vy *= 0.9;
        if (c.t >= 0.2 && p.z <= 0) { c.move = 'pump'; c.t = 0; p.vx = p.vy = 0; }
      } else {
        // fist in the air, again and again, looking at the camera
        p.vx = p.vy = 0; p.dirX = 0; p.dirY = 1;
        if (p.z <= 0 && p.vz === 0 && c.t >= 0.12) { hop(p, CELE.pumpV); c.t = 0; }
      }
    } else if (c.role === 'join') {
      // a place in the ring round the scorer (where he is now), then jumping with him
      const a = Math.PI * (0.15 + 0.7 * (c.n / 3)) + (c.n % 2 ? Math.PI : 0), cx = star ? star.x : c.x, cy = star ? star.y : c.y;
      const there = runTo(p, cx + Math.cos(a) * CELE.ring * 1.6, cy + Math.sin(a) * CELE.ring * 0.95, CELE.join);
      if (there) {
        c.move = 'hop'; p.dirX = Math.sign(cx - p.x) || 1; p.dirY = cy > p.y ? 0.6 : -0.6; p.facing = p.dirX > 0 ? 1 : -1;
        if (p.z <= 0 && p.vz === 0 && c.t >= 0.1 + (c.n % 3) * 0.07) { hop(p, CELE.hopV); c.t = 0; }
      } else c.move = 'run';
    } else if (c.move === 'zoom') {
      // Thor: mad circles in front of his goal
      const a = t * CELE.zoomW, x = c.x + Math.cos(a) * CELE.zoomR * 1.4, y = c.y + Math.sin(a) * CELE.zoomR;
      p.vx = (x - p.x) / Math.max(dt, 1e-3) * 0.5; p.vy = (y - p.y) / Math.max(dt, 1e-3) * 0.5;
      p.dirX = -Math.sin(a); p.dirY = Math.cos(a); p.facing = p.dirX > 0 ? 1 : -1;
    } else { p.vx = p.vy = 0; if (c.t >= 0.5) { hop(p, CELE.hopV); c.t = 0; } }
  }
}

/** The celebration played by a person: the stick walks him proudly round the pitch and each button is a gesture. Tiro: a jump with the fist
 *  up. Pase: he waves at the crowd. Salto (or Tiro and Pase together): a somersault. Especial: the pose at the camera (thumb up and a wink). */
function stepFree(m: Match, p: Player, c: Cele, dt: number): void {
  const f = p.input, air = p.z > 0 || p.vz !== 0;
  c.idle = (c.idle ?? 0) + dt;
  const posing = (c.move === 'wave' && c.t < CELE.waveT) || (c.move === 'burla' && c.t < CELE.burlaT);
  // a button pressed in the air is not lost: he makes the gesture as soon as he lands
  const now = f.jumpPressed || (f.shootPressed && f.passPressed) ? 'flip' : f.shootPressed ? 'pump' : f.passPressed ? 'wave' : f.specialPressed ? 'burla' : null;
  if (now) { c.next = now; m.data.celeAt = m.t; }
  if (!air) {
    const g = c.next ?? null; c.next = null;
    if (g) {
      c.move = g; c.t = 0; c.idle = 0;
      const first = !((c.did ?? 0) & (1 << GESTURES.indexOf(g)));
      c.did = (c.did ?? 0) | (1 << GESTURES.indexOf(g));
      if (g === 'flip') hop(p, CELE.flipV); else if (g === 'pump') hop(p, CELE.pumpV); else { p.vx = p.vy = 0; p.dirX = 0; p.dirY = 1; }
      m.data.celeAt = m.t;
      // v: which gesture (10 + its place in GESTURES), plus 10 more the first time she makes it (the crowd likes a new one better)
      emit(m, 'celemove', p.x, p.y, p.z, p.id, 10 + GESTURES.indexOf(g) + (first ? 10 : 0));
      return;
    }
  }
  if (posing) { p.vx = p.vy = 0; return; }
  const mag = Math.hypot(f.mx, f.my);
  if (mag > 0.3) {
    const k = Math.min(1, mag) / mag;
    // a little more than the speed wanted: the player brakes a bit every step (player.ts)
    p.vx = f.mx * k * (CELE.prance + 12); p.vy = f.my * k * (CELE.prance + 12) * T.yFactor;
    p.dirX = f.mx / mag; p.dirY = f.my / mag; if (Math.abs(f.mx) > 0.2) p.facing = f.mx > 0 ? 1 : -1;
    m.data.celeAt = m.t;
    if (!air) { if (c.move !== 'prance') c.t = 0; c.move = 'prance'; }
  } else {
    p.vx *= air ? 0.96 : 0; p.vy *= air ? 0.96 : 0;
    if (!air) {
      if (c.move !== 'pose' && c.move !== 'pump') { c.move = 'pose'; c.t = 0; p.dirX = 0; p.dirY = 1; }
      // left alone he does not stand there: the fist in the air, again and again
      if ((c.idle ?? 0) >= CELE.lazy && c.t >= 0.12) { c.move = 'pump'; hop(p, CELE.pumpV); c.t = 0; }
    }
  }
}
