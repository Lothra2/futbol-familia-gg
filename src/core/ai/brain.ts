import { T } from '../tuning';
import { DT } from '../step';
import { PITCH, attackDir, goalX, ownGoalX } from '../field';
import { choosePass, segDist } from '../actions';
import { emptyInput, type InputFrame } from '../types';
import { aiParams } from './difficulty';
import { formationTarget, teamMode } from './formation';
import { keeperThink } from './keeper';
import { etaTo, ballAt } from './predict';
import type { AIMind, Match, Player } from '../state';

const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
/** Where a forward goes while a teammate carries the ball (mejora 2): first and second post when the carrier is about to cross from the wing,
 *  a run behind the last defender every few seconds (one forward at a time, the farthest from the ball), and otherwise the free space ahead of the ball. */
function supportSpot(m: Match, p: Player, carrier: Player, foes: Player[], dir: 1 | -1, gx: number): { x: number; y: number; sprint: boolean } {
  const A = p.ai, field = foes.filter((q) => q.role !== 'gk');
  if (Math.abs(gx - carrier.x) < 240 && (carrier.y < 42 || carrier.y > 118)) {
    const first = p.slot === 3;
    return { x: gx - dir * (first ? 36 : 58), y: first ? 66 : 94, sprint: true };
  }
  if (A.runUntil !== undefined && m.t < A.runUntil) return { x: A.runX!, y: A.runY!, sprint: true };
  const key = `runAt${p.team}`, next = (m.data[key] as number | undefined) ?? 0;
  if (m.t >= next && field.length) {
    const fw = m.players.filter((q) => q.team === p.team && q.role === 'fwd' && q.control === 'ai' && q.id !== carrier.id);
    const far = fw.sort((a, c) => Math.hypot(c.x - carrier.x, c.y - carrier.y) - Math.hypot(a.x - carrier.x, a.y - carrier.y))[0];
    if (far && far.id === p.id) {
      const last = field.reduce((a, c) => (c.x * dir > a.x * dir ? c : a));
      if ((last.x - carrier.x) * dir > 30) {
        A.runUntil = m.t + T.space.runFor; A.runX = clamp(last.x + dir * 22, 40, PITCH.w - 40); A.runY = clamp(last.y < 80 ? last.y + 40 : last.y - 40, 14, PITCH.d - 14);
        m.data[key] = m.t + m.rng.range(T.space.runEvery[0], T.space.runEvery[1]) * (aiParams(m, p).counter > 0 ? 0.5 : 1);
        return { x: A.runX, y: A.runY, sprint: true };
      }
      m.data[key] = m.t + 1;   // nobody to run behind yet: look again in a second
    }
  }
  // the free space ahead of the ball: the candidate farthest from every rival, near where he already is, not in the lane of the carrier or of the other forward
  const other = m.players.find((q) => q.team === p.team && q.role === 'fwd' && q.id !== p.id && q.id !== carrier.id);
  let best = { x: p.x, y: p.y, s: -Infinity };
  for (const ox of [T.space.minX, (T.space.minX + T.space.maxX) / 2, T.space.maxX]) for (const cy of [24, 52, 80, 108, 136]) {
    const cx = clamp(carrier.x + dir * ox, 40, PITCH.w - 40);
    if (Math.abs(cy - carrier.y) < 18 && Math.abs(cx - carrier.x) < 90) continue;
    let near = 99; for (const o of field) near = Math.min(near, Math.hypot(o.x - cx, (o.y - cy) / T.yFactor));
    let sc = Math.min(near, 60) / 60 * 2 - Math.hypot(cx - p.x, cy - p.y) / 260 + (Math.abs(gx - cx) < 240 ? 0.3 : 0);
    if (other && Math.hypot(other.x - cx, other.y - cy) < 28) sc -= 1;
    if (near < T.space.safe) sc -= 0.8;
    if (sc > best.s) best = { x: cx, y: cy, s: sc };
  }
  return { x: best.x, y: best.y, sprint: Math.hypot(best.x - p.x, best.y - p.y) > 80 };
}

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
    // a cross: on the wing in the last 220 px with a mate waiting at the far post, a high pass to him (the same held pass a person does)
    if (dGoal < T.cross.zone && dGoal > 60 && (p.y < T.cross.wing || p.y > PITCH.d - T.cross.wing) && p.holdT > 0.5 && m.rng.chance(T.cross.aiChance * par.crossBias)) {
      const spot = { x: gx - dir * T.cross.post, y: p.y < 80 ? 80 + T.cross.far : 80 - T.cross.far };
      if (mates.some((q) => Math.hypot(q.x - spot.x, q.y - spot.y) < T.cross.snap)) {
        f.mx = dir; f.my = 0; f.passPressed = true; f.pass = true; A.holdBtn = 'pass'; A.holdLeft = 0.3; A.held = { ...f, passPressed: false }; A.armedAt = 0;
        return f;
      }
    }
    // the counter (Tiburoncitos): the ball was just won, so the long ball to the forward who already runs, before the rivals get back
    const holdSince = (m.data.holdSince as number | undefined) ?? 0;
    if (par.counter > 0 && m.t - holdSince < 1.6 && p.holdT > 0.15 && p.holdT < 1.0 && m.rng.chance(0.5 * par.counter)) {
      const pc = choosePass(m, p, 0, 0, 360);
      if (pc && (pc.x - p.x) * dir >= 140 && !foes.some((o) => segDist(o.x, o.y, p.x, p.y, pc.x, pc.y) < 18)) {
        const mate = m.players.find((q) => q.id === pc.id) ?? pc, md = Math.hypot(mate.x - p.x, mate.y - p.y) || 1, d = Math.hypot(pc.x - p.x, pc.y - p.y);
        f.mx = (mate.x - p.x) / md; f.my = (mate.y - p.y) / md; f.passPressed = true; f.pass = true;
        if (d > 200) { A.holdBtn = 'pass'; A.holdLeft = 0.3; A.held = { ...f, passPressed: false }; } else f.pass = false;
        A.armedAt = 0;
        return f;
      }
    }
    const shootRange = p.role === 'def' ? par.shootRange * 0.8 : par.shootRange;
    if (dGoal <= shootRange && ready(true)) {
      const gk = foes.find((q) => q.role === 'gk');
      f.my = 0.55 * (gk && Math.abs(gk.y - 80) > 5 && m.rng.chance(0.4) ? (gk.y < 80 ? 1 : -1) : m.rng.chance(0.5) ? 0 : m.rng.chance(0.5) ? 1 : -1);   // 0.55 of the stick is the 68 / 92 of the old three-point aim
      f.mx = dir; f.shootPressed = true; f.shoot = true;
      if (dGoal > 150) { A.holdBtn = 'shoot'; A.holdLeft = 0.3; A.held = { ...f, shootPressed: false }; } else f.shoot = false;
      A.armedAt = 0;
      return f;
    }
    const pressed = !!near;
    const proactive = (p.role === 'def' && dGoal > 420 && m.rng.chance(0.2)) || (dGoal > 300 && m.rng.chance(0.03));
    // a progressive pass: a mate clearly further ahead, free, with nobody on the line, is played to after he has held the ball a moment
    let progressive = false;
    if (!pressed && !proactive && p.holdT > T.space.progressHold && dGoal > shootRange + 20 && m.rng.chance(T.space.progressive * par.passBias)) {
      const pc = choosePass(m, p, 0, 0, 260);
      progressive = !!pc && (pc.x - p.x) * dir >= T.space.progressGain && !foes.some((o) => segDist(o.x, o.y, p.x, p.y, pc.x, pc.y) < 20 || Math.hypot(o.x - pc.x, o.y - pc.y) < 28);
    }
    if ((pressed || proactive || progressive) && (proactive || progressive || ready(true))) {
      const c = choosePass(m, p, 0, 0, progressive ? 260 : 300);
      if (c && (c.x - p.x) * dir > -30) {
        // the stick points at the mate himself (not at the lead point of a through pass, which can fall outside the 30 degree cone for a close mate)
        const mate = m.players.find((q) => q.id === c.id) ?? c, md = Math.hypot(mate.x - p.x, mate.y - p.y) || 1, d = Math.hypot(c.x - p.x, c.y - p.y);
        f.mx = (mate.x - p.x) / md; f.my = (mate.y - p.y) / md; f.passPressed = true; f.pass = true;
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
    // a human of my team is containing the carrier: the closest AI mate does not rush in, he cuts the lane to the best receiver of the rival
    const humanContains = m.players.some((q) => q.team === p.team && q.control === 'human' && (q.containT ?? 0) > 0);
    if (humanContains && rank === 0) {
      const c = choosePass(m, carrier, 0, 0, 300);
      if (c) { go((carrier.x + c.x) / 2, (carrier.y + c.y) / 2, Math.hypot(p.x - c.x, p.y - c.y) > 70); return f; }
    }
    const pressers = Math.min(3, par.press + (danger ? 1 : 0));
    // the next one after those who press cuts the lane to the most dangerous receiver instead of waiting on his spot (mejora 2: a pass is not free)
    if (!sitBack && rank === pressers && !(humanContains && rank === 0) && (p.team === 0 || m.difficulty === 'campeones')) {   // Tranquilos and Normales rivals do not cut lanes: with them passing flows
      const c = choosePass(m, carrier, 0, 0, 300);
      if (c) { go(carrier.x + (c.x - carrier.x) * T.space.cutAt, carrier.y + (c.y - carrier.y) * T.space.cutAt, Math.hypot(p.x - c.x, p.y - c.y) > 70); return f; }
    }
    if (!sitBack && !(humanContains && rank === 0) && rank < pressers) {
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
    let x = t.x, y = t.y, sprint = false;
    const lp = m.lastPass;
    if (lp && lp.from === p.id && lp.team === p.team && m.t - lp.t < T.space.goFor && carrier.id === lp.to) {
      // pass and go: whoever just passed runs into the space ahead of the receiver, asking for the ball back (the one-two the human can return in one touch)
      x = clamp(carrier.x + dir * T.space.goAhead, 40, PITCH.w - 40); y = clamp(carrier.y > 80 ? carrier.y - 36 : carrier.y + 36, 14, PITCH.d - 14); sprint = true;
    } else if (p.role === 'fwd') { const sp = supportSpot(m, p, carrier, foes, dir, gx); x = sp.x; y = sp.y; sprint = sp.sprint; }
    else if (p.role === 'def' && (carrier.x - PITCH.w / 2) * dir > -160) {
      // short support: the defender who is on the far side of the carrier comes up behind the ball, a triangle for the pass back
      const defs = m.players.filter((q) => q.team === p.team && q.role === 'def').sort((a, c) => Math.abs(c.y - carrier.y) - Math.abs(a.y - carrier.y));
      if (defs[0]?.id === p.id) { x = clamp(carrier.x - dir * T.space.supportAt, 40, PITCH.w - 40); y = clamp(carrier.y > 80 ? carrier.y - 50 : carrier.y + 50, 14, PITCH.d - 14); }
    }
    go(x, y, sprint || Math.hypot(x - p.x, y - p.y) > 80);
    return f;
  }

  // ------------------------------------------------------------------ loose ball
  // the mates the AI plays with do not wait for the human: they race for the ball among themselves
  // the receiver of a pass of his team goes to meet it, whoever else is closer (the others keep their place)
  const lp = m.lastPass;
  if (lp && lp.to === p.id && lp.team === p.team && !lp.done && m.t - lp.t < 2.5 && b.state === 'free') {
    const tgt = ballAt(m, Math.min(0.5, etaTo(m, p)));
    go(tgt.x, tgt.y, true);
    return f;
  }
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
