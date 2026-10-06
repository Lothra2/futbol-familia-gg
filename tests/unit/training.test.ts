import { describe, expect, it } from 'vitest';
import { createMatch, step } from '../../src/core/match';
import { setHumanInput } from '../../src/core/control';
import { Training, CHALLENGES } from '../../src/app/training';
import { botFrame, newBot } from '../../src/core/ai/testbots';

const mk = (): ReturnType<typeof createMatch> => createMatch({ seed: 3, training: true, humans: [{ team: 0, slot: 3, humanSlot: 0, controls: 'full' }] });

describe('entrenamiento con Thor', () => {
  it('no hay reloj: el partido nunca termina y la barra siempre esta llena', () => {
    const m = mk();
    for (let i = 0; i < 60 * 60 * 5; i++) step(m);
    expect(m.phase).not.toBe('over'); expect(m.bar[0]).toBe(100); expect(m.halfLength).toBeGreaterThan(1e6);
  });
  it('los rivales de campo son conos: no se mueven ni se quedan con el balon', () => {
    const m = mk(); const st = newBot('sophie');
    const cones = m.players.filter((p) => p.team === 1 && p.role !== 'gk').map((p) => [p.x, p.y]);
    for (let i = 0; i < 60 * 90; i++) { setHumanInput(m, 0, botFrame(m, m.humans[0], st)); step(m); const o = m.players.find((q) => q.id === m.ball.owner); expect(o && o.team === 1 && o.role !== 'gk').toBeFalsy(); }
    m.players.filter((p) => p.team === 1 && p.role !== 'gk').forEach((p, i) => { expect(Math.hypot(p.x - cones[i][0], p.y - cones[i][1])).toBeLessThan(40); });
  });
  it('los retos avanzan en orden con lo que hace la familia y terminan', () => {
    const m = mk(); const t = new Training(m);
    expect(t.update(m)).toMatchObject({ index: 0, have: 0, need: 5 });
    const f = m.players.filter((p) => p.team === 0 && p.role !== 'gk');
    f[0].stats2.passes = 5;
    expect(t.update(m)).toMatchObject({ justDone: true, index: 1 });
    f[0].stats2.chips = 2; expect(t.update(m).justDone).toBe(true);
    f[1].stats2.goals = 3; expect(t.update(m).justDone).toBe(true);
    f[1].stats2.spGoals = 1; const v = t.update(m);
    expect(v.allDone).toBe(true); expect(v.title).toContain('completo');
    expect(CHALLENGES.length).toBe(4);
  });
  it('con controles faciles se salta el pase alto', () => { const m = mk(); const t = new Training(m, true); expect(t.total).toBe(3); });
});
