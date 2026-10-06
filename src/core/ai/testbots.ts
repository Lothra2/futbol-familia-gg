import { DT } from '../step';
import { aiInput } from './brain';
import { goalX } from '../field';
import { emptyInput, type InputFrame } from '../types';
import { T } from '../tuning';
import type { HumanCtl, Match } from '../state';

export type BotKind = 'nina5' | 'sophie' | 'quieto';
interface BotState { kind: BotKind; nextAim: number; aim: number; still: number; shootAt: number; specialAt: number; mx: number; my: number }
export const newBot = (kind: BotKind): BotState => ({ kind, nextAim: 0, aim: 0, still: 0, shootAt: 0, specialAt: 0, mx: 0, my: 0 });

/** Test stand-ins for a human (TECH section 8). They only read the match, like a person looking at the screen.
 *  nina5: aims at the ball with 40 degrees of error, stands still a fifth of the time, presses the kick button late and the special when it glows.
 *  sophie: plays like the Normales AI with twice the reaction time and no frontal steals.
 *  quieto: touches nothing. */
export function botFrame(m: Match, h: HumanCtl, s: BotState): InputFrame {
  const p = m.players.find((q) => q.id === h.id)!;
  if (s.kind === 'quieto') return emptyInput();
  if (s.kind === 'sophie') {
    const saved = { ...p.ai };
    const f = aiInput(m, Object.assign(p, { control: 'ai' as const }), true);
    p.control = 'human';
    void saved;
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
