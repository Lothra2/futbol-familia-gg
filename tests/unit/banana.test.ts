import { describe, expect, it } from 'vitest';
import { createMatch, step } from '../../src/core/match';
import { setHumanInput } from '../../src/core/control';
import { MID } from '../../src/core/field';
import { clear, give, inp, put } from './helpers';

/** Sophie (a person) shoots from 300 px out, straight at the middle of the goal; `hold` is the stick held after the kick. */
function shoot(hold: number): { dy: number; v: number } {
  const m = createMatch({ ai: 'none', skipKickoff: true, seed: 2, humans: [{ team: 0, slot: 4, humanSlot: 0, controls: 'full' }] });
  for (const p of m.players) p.speedMult = 1;
  clear(m);
  const me = m.players.find((p) => p.id === m.humans[0].id)!;
  put(me, 640, MID); me.facing = 1; give(m, me);
  for (let i = 0; i < 10; i++) { setHumanInput(m, 0, inp()); step(m); give(m, me); }
  setHumanInput(m, 0, inp({ shoot: true, shootPressed: true })); step(m);
  setHumanInput(m, 0, inp()); step(m);
  let v = 0;
  for (let i = 0; i < 40; i++) { setHumanInput(m, 0, inp({ my: hold })); step(m); v = Math.max(v, Math.hypot(m.ball.vx, m.ball.vy)); }
  return { dy: m.ball.y - MID, v };
}

describe('tiros como Nekketsu', () => {
  it('un toque de Tiro ya sale como cañonazo (rápido y recto)', () => {
    const s = shoot(0);
    expect(s.v).toBeGreaterThan(300); expect(Math.abs(s.dy)).toBeLessThan(14);
  });
  it('la banana: mantener arriba o abajo después de patear curva el balón para ese lado', () => {
    const up = shoot(-1), down = shoot(1), none = shoot(0);
    expect(up.dy).toBeLessThan(none.dy - 12); expect(down.dy).toBeGreaterThan(none.dy + 12);
  });
});
