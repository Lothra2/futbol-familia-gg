import { T } from '../tuning';
import { DT } from '../step';
import { PITCH, attackDir, goalX, ownGoalX } from '../field';
import { choosePass } from '../actions';
import { emptyInput, type InputFrame } from '../types';
import { aiParams } from './difficulty';
import { formationTarget, teamMode } from './formation';
import { keeperThink } from './keeper';
import { etaTo, ballAt } from './predict';
import type { AIMind, Match, Player } from '../state';

const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

export const newMind = (): AIMind => ({
  nextThink: 0, held: emptyInput(), armedAt: 0, holdLeft: 0, holdBtn: null, lastX: 0, lastY: 0, lastT: 0, sidestepUntil: 0, sidestepDx: 0, sidestepDy: 0,
  threat: false, rolled: false, armedAtThreat: 0, diveT: 0, specialAt: 0, goalDist: 0, wasWanting: false, thinkT: 0, pathLen: 0,
});

/** The input of an AI player for this step. The decision is taken ten times a second and kept in between; presses last one step. */
export function aiInput(m: Match, p: Player, humanize = false): InputFrame {
  if (p.role === 'gk') return keeperThink(m, p);
  const A = p.ai;
  if (A.holdLeft > 0) {
    A.holdLeft -= DT;
    const on = A.holdLeft > 0;
    const f = { ...A.held, shootPressed: false, passPressed: false, specialPressed: false, shoot: A.holdBtn === 'shoot' && on, pass: A.holdBtn === 'pass' && on };
    if (!on) A.holdBtn = null;
    return f;
  }
  if (m.t >= A.nextThink) {
    const f = brainThink(m, p, humanize);
    A.nextThink = m.t + 0.1 + m.rng.range(0, 0.04);
    A.held = { ...f, shootPressed: false, passPressed: false, specialPressed: false };
    return f;
  }
  return { ...A.held };
}

function brainThink(m: Match, p: Player, humanize: boolean): InputFrame {
  const f = emptyInput(), A = p.ai, b = m.ball, par = aiParams(m, p);
  const dir = attackDir(p.team), gx = goalX(p.team);
  const mates = m.players.filter((q) => q.team === p.team && q.role !== 'gk' && q.id !== p.id);
  const foes = m.players.filter((q) => q.team !== p.team);
  const go = (x: number, y: number, sprint = false): void => {
    const dx = x - p.x, dy = (y - p.y) / T.yFactor, d = Math.hypot(dx, dy);
    A.goalDist = d;
    if (d > 3) { f.mx = dx / d; f.my = (y - p.y) / Math.max(1, Math.hypot(dx, y - p.y)); const n = Math.hypot(f.mx, f.my) || 1; f.mx /= n; f.my /= n; }
    f.sprint = sprint && p.stamina > 35 && d > 30;
  };
  const ready = (cond: boolean): boolean => { if (!cond) { A.armedAt = 0; return false; } if (A.armedAt === 0) A.armedAt = m.t; return m.t - A.armedAt >= par.reaction * (humanize ? 2 : 1); };

  const gap = m.t - A.thinkT;
  if (gap > 0.5) A.wasWanting = false;   // the AI did not run for a while (a cinematic): start counting again
  else A.pathLen += Math.hypot(p.vx, p.vy) * gap;
  A.thinkT = m.t;
  // stuck detection: he has wanted to go somewhere for 3 s in a row and did not move
  const wantsNow = Math.hypot(A.held.mx, A.held.my) > 0.3 && A.goalDist > 25 && m.phase === 'play' && !p.act && p.state !== 'hold';
  if (!wantsNow) { A.lastT = m.t; A.pathLen = 0; A.wasWanting = false; }
  else {
    if (!A.wasWanting) { A.lastT = m.t; A.pathLen = 0; A.wasWanting = true; }
    else if (m.t - A.lastT >= 3) {
      if (A.pathLen < 4) {   // he did not move at all: something is blocking him (running back and forth is not being stuck)
        m.data.stuck = ((m.data.stuck as number) ?? 0) + 1;
        A.sidestepUntil = m.t + 0.5; const a = m.rng.range(0, Math.PI * 2); A.sidestepDx = Math.cos(a); A.sidestepDy = Math.sin(a);
      }
      A.lastT = m.t; A.pathLen = 0;
    }
  }
  if (m.t < A.sidestepUntil) { f.mx = A.sidestepDx; f.my = A.sidestepDy; return f; }

  if (m.phase === 'kickoff' || m.phase === 'restart') {
    const t = formationTarget(m, p, 'neutral'); go(t.x, t.y); return f;
  }
  const carrier = b.owner === null ? null : m.players.find((q) => q.id === b.owner) ?? null;
  const mine = !!carrier && carrier.team === p.team, theirs = !!carrier && carrier.team !== p.team;

  // ------------------------------------------------------------------ I carry the ball
  if (carrier && carrier.id === p.id) {
    const dGoal = Math.abs(gx - p.x);
    const near = foes.filter((q) => q.role !== 'gk' && (q.x - p.x) * dir > -6 && Math.hypot(q.x - p.x, (q.y - p.y) / T.yFactor) < 34).sort((a, c) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(c.x - p.x, c.y - p.y))[0];
    // the special, when the bar is full, close enough and after a short wait
    if (m.bar[p.team] >= T.bar.max && (p.team === 1 || !m.players.some((q) => q.team === 0 && q.control === 'human')) && dGoal <= (p.team === 1 ? T.special.aiRange : PITCH.w * T.special.zone)) {
      const full = ((m.data.fullAt as number[] | undefined) ?? [0, 0])[p.team];
      if (A.specialAt === 0) A.specialAt = full + m.rng.range(T.special.aiDelayMin, T.special.aiDelayMax);
      if (m.t >= A.specialAt) { f.specialPressed = true; A.specialAt = 0; return f; }
    }
    const shootRange = p.role === 'def' ? par.shootRange * 0.8 : par.shootRange;
    if (dGoal <= shootRange && ready(true)) {
      const gk = foes.find((q) => q.role === 'gk');
      f.my = gk && Math.abs(gk.y - 80) > 5 && m.rng.chance(0.4) ? (gk.y < 80 ? 1 : -1) : m.rng.chance(0.5) ? 0 : m.rng.chance(0.5) ? 1 : -1;
      f.mx = dir; f.shootPressed = true; f.shoot = true;
      if (dGoal > 150) { A.holdBtn = 'shoot'; A.holdLeft = 0.3; A.held = { ...f, shootPressed: false }; } else f.shoot = false;
      A.armedAt = 0;
      return f;
    }
    const pressed = !!near;
    const proactive = (p.role === 'def' && dGoal > 420 && m.rng.chance(0.2)) || (dGoal > 300 && m.rng.chance(0.03));
    if ((pressed || proactive) && (proactive || ready(true))) {
      const c = choosePass(m, p, 0, 0, 300);
      if (c && (c.x - p.x) * dir > -30) {
        const d = Math.hypot(c.x - p.x, c.y - p.y);
        f.mx = (c.x - p.x) / d; f.my = (c.y - p.y) / d; f.passPressed = true; f.pass = true;
        if (d > 200) { A.holdBtn = 'pass'; A.holdLeft = 0.3; A.held = { ...f, passPressed: false }; } else f.pass = false;
        A.armedAt = 0;
        return f;
      }
    }
    if (dGoal > shootRange) A.armedAt = 0;   // while he is within range the wait to shoot keeps counting while he runs on
    let ty = 80;
    if (near) ty = clamp(p.y + (p.y <= near.y ? -1 : 1) * 40, 12, PITCH.d - 12);
    else ty = clamp(p.y + (80 - p.y) * 0.3, 12, PITCH.d - 12);
    go(gx - dir * 6, ty, !near || Math.hypot(near.x - p.x, near.y - p.y) > 60);
    return f;
  }

  // ------------------------------------------------------------------ a rival carries the ball
  if (theirs && carrier) {
    const order = m.players.filter((q) => q.team === p.team && q.role !== 'gk' && q.control === 'ai').sort((a, c) => Math.hypot(a.x - carrier.x, a.y - carrier.y) - Math.hypot(c.x - carrier.x, c.y - carrier.y));
    const rank = order.indexOf(p);
    const danger = Math.abs(carrier.x - ownGoalX(p.team)) < 300;
    const sitBack = m.difficulty === 'tranquilos' && p.team === 1 && Math.abs(carrier.x - ownGoalX(p.team)) > 450;   // the Tranquilos let the game flow in the middle
    if (!sitBack && rank < Math.min(2, par.press + (danger ? 1 : 0))) {
      const lead = ballAt(m, 0.25);
      const d = Math.hypot(carrier.x - p.x, carrier.y - p.y);
      go(lead.x, lead.y, d > 60);
      const ahead = (carrier.x - p.x) * (f.mx >= 0 ? 1 : -1);
      const inReach = Math.abs(carrier.x - p.x) <= T.steal.reach + 2 && Math.abs(carrier.y - p.y) <= T.steal.dy && ahead >= -2;
      const slideRate = carrier.control === 'human' && carrier.controls === 'full' ? par.humanSlideRate : carrier.control === 'human' ? 0 : par.slideRate;
      if (!humanize && ready(inReach)) { f.shootPressed = true; f.shoot = false; A.armedAt = 0; }
      else if (d > 18 && d < 34 && p.cd.slide <= 0 && m.rng.chance(slideRate * 0.4)) { f.slide = true; f.shootPressed = true; f.shoot = false; if (Math.abs(carrier.x - p.x) > 2) { f.mx = Math.sign(carrier.x - p.x); f.my = (carrier.y - p.y) / Math.max(20, d); } }
      if (humanize && d > 18 && d < 34 && p.cd.slide <= 0 && m.rng.chance(0.08)) { f.shootPressed = true; f.mx = Math.sign(carrier.x - p.x); }
      return f;
    }
    const t = formationTarget(m, p, teamMode(m, p) === 'attack' ? 'neutral' : 'defend'); go(t.x, t.y); return f;
  }

  // ------------------------------------------------------------------ a teammate carries it: support
  if (mine && carrier) {
    const t = formationTarget(m, p, teamMode(m, p) === 'defend' ? 'neutral' : 'attack');
    const lane = p.slot % 2 === 1 ? 1 : -1;   // 1: lower lane
    let x = t.x, y = t.y;
    if (p.role === 'fwd') { x = clamp(carrier.x + dir * 90, 40, PITCH.w - 40); if (Math.abs(gx - x) < 90) x = gx - dir * 90; y = clamp(carrier.y + (lane > 0 ? 1 : -1) * 36, 14, PITCH.d - 14); if (Math.abs(y - carrier.y) < 20) y = carrier.y + (carrier.y > 80 ? -34 : 34); }
    go(x, y, Math.hypot(x - p.x, y - p.y) > 80);
    return f;
  }

  // ------------------------------------------------------------------ loose ball
  // the mates the AI plays with do not wait for the human: they race for the ball among themselves
  const cands = m.players.filter((q) => q.team === p.team && q.role !== 'gk' && q.control === 'ai');
  const eta = etaTo(m, p), best = Math.min(...cands.map((q) => etaTo(m, q)));
  const untouched = m.t - b.lastTouch.t > 4;
  if (eta <= best + 0.0001 || eta < 0.6 || untouched) {
    const tgt = ballAt(m, Math.min(0.5, eta));
    go(tgt.x, tgt.y, eta > 0.8);
    if (b.state === 'free' && b.z >= T.aerial.zMin && b.z <= T.aerial.headerZ && Math.abs(b.x - p.x) < 20 && Math.abs(b.y - p.y) < 12 && ready(true)) { f.shootPressed = true; f.shoot = false; A.armedAt = 0; }
    return f;
  }
  const t = formationTarget(m, p, 'neutral'); go(t.x, t.y);
  return f;
}
