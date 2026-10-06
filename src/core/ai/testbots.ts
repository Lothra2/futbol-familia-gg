import { DT } from '../step';
import { aiInput } from './brain';
import { goalX } from '../field';
import { emptyInput, type InputFrame } from '../types';
import { T } from '../tuning';
import { stealTarget } from '../actions';
import type { HumanCtl, Match } from '../state';

export type BotKind = 'nina5' | 'sophie' | 'quieto';
interface BotState { kind: BotKind; nextAim: number; aim: number; still: number; shootAt: number; specialAt: number; mx: number; my: number; ringFor?: object; ringErr: number; ringDone: boolean }
export const newBot = (kind: BotKind): BotState => ({ kind, nextAim: 0, aim: 0, still: 0, shootAt: 0, specialAt: 0, mx: 0, my: 0, ringErr: 0, ringDone: false });

/** Test stand-ins for a human (TECH section 8). They only read the match, like a person looking at the screen.
 *  nina5: aims at the ball with 40 degrees of error, stands still a fifth of the time, presses the kick button late and the special when it glows.
 *  sophie: plays like the Normales AI with twice the reaction time, presses the AHORA ring within 0.1 s of its centre, and defends with the verbs a person learns: close steals, hold Pass to contain.
 *  quieto: touches nothing. */
export function botFrame(m: Match, h: HumanCtl, s: BotState): InputFrame {
  const p = m.players.find((q) => q.id === h.id)!;
  if (s.kind === 'quieto') return emptyInput();
  if (s.kind === 'sophie') {
    const saved = { ...p.ai };
    const f = aiInput(m, Object.assign(p, { control: 'ai' as const }), true);
    p.control = 'human';
    void saved;
    // she has learned first time: a pass is on its way to her and the goal is near, so she presses Tiro before the ball arrives (the press is kept, see actions.ts)
    // the AHORA ring of the cinematic: she presses when it closes, a tenth of a second early or late (the ring is the same for every person)
    const sp = m.special;
    if (m.phase === 'cinematic' && sp?.ring && sp.ring.slot === h.slot) {
      if (s.ringFor !== sp) { s.ringFor = sp; s.ringErr = m.rng.range(-0.1, 0.1); s.ringDone = false; }
      if (!s.ringDone && sp.t >= sp.ring.center + s.ringErr) { s.ringDone = true; f.shootPressed = true; }
    }
    const lpass = m.lastPass, b = m.ball;
    if (lpass && lpass.to === p.id && lpass.team === p.team && b.state === 'free' && !f.shootPressed && Math.abs(goalX(p.team) - p.x) < 190 && Math.hypot(b.x - p.x, b.y - p.y) < 110 && m.t - lpass.t < 1.5) { f.shootPressed = true; f.shoot = false; }
    // she has learned the defending verbs of docs/MEJORAS_JUGABILIDAD.md (mejora 1): close steals (the AI already presses Tiro in reach), and instead of a
    // slide from afar she holds Pass to contain the carrier until he is close enough to steal
    const c = m.players.find((q) => q.id === m.ball.owner);
    const rivalCarrier = !!c && c.team !== p.team && m.phase === 'play' && m.ball.state === 'owned';
    if (rivalCarrier && Math.hypot(c!.x - p.x, c!.y - p.y) < 45) {
      const inReach = !!stealTarget(m, p);
      if (f.slide || (f.shootPressed && !inReach)) { f.slide = false; f.shootPressed = false; f.shoot = false; }   // no slide from afar: contain instead
      if (!f.shootPressed) { f.pass = true; f.passPressed = !p.pass.down; }
      // after half a second of holding him, a try from the front when he is in reach
      if ((p.containT ?? 0) >= T.contain.after && !f.shootPressed && inReach) { f.shootPressed = true; f.pass = true; f.passPressed = false; }
    }
    return f;
  }
  const b = m.ball, f = emptyInput();
  if (m.t >= s.nextAim) {
    s.nextAim = m.t + 0.3;
    if (s.still > 0) s.still -= 0.3;
    else if (m.rng.chance(0.2)) s.still = 0.5;
    const tx = m.ball.owner === p.id ? goalX(p.team) : b.x, ty = m.ball.owner === p.id ? 80 : b.y;
    const a = Math.atan2(ty - p.y, tx - p.x) + m.rng.range(-0.7, 0.7);
    s.aim = a; s.mx = Math.cos(a); s.my = Math.sin(a);
  }
  if (s.still <= 0) { f.mx = s.mx; f.my = s.my; }
  const has = b.owner === p.id, near = Math.abs(b.x - p.x) < 20 && Math.abs(b.y - p.y) < 14;
  if (has || near) { if (s.shootAt === 0) s.shootAt = m.t + 0.4; if (m.t >= s.shootAt) { f.shootPressed = true; s.shootAt = 0; } } else s.shootAt = 0;
  if (m.bar[p.team] >= T.bar.max && has) { if (s.specialAt === 0) s.specialAt = m.t + 1; if (m.t >= s.specialAt) { f.specialPressed = true; s.specialAt = 0; } }
  void DT;
  return f;
}
