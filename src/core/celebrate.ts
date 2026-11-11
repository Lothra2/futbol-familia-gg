import { T } from './tuning';
import { PITCH, attackDir } from './field';
import { emit } from './events';
import type { Match, Player, Team } from './state';

/** What a player does while his team celebrates a goal (the view picks the animation from it). */
export type CeleMove = 'run' | 'flip' | 'slide' | 'spin' | 'pump' | 'hop' | 'zoom';
/** The part of each player in the celebration: the scorer runs to his spot and does his thing, his mates run to him and jump round him,
 *  and the keeper celebrates in his goal (Thor runs in circles). `t` is the time in the current move, `n` his place in the ring. */
export interface Cele { role: 'star' | 'join' | 'keeper'; x: number; y: number; n: number; move: CeleMove; t: number; style: number }

const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
/** Speed of the run to the spot, the time the scorer runs before his move, how long the move lasts, and the lift of the jumps. */
export const CELE = { run: 150, join: 175, runT: 0.8, moveT: 0.55, flipV: 235, pumpV: 150, hopV: 135, slideV: 190, ring: 24, zoomR: 15, zoomW: 9 } as const;

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
