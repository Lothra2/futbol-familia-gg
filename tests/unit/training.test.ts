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
    f[1].stats2.spGoals = 1; expect(t.update(m).justDone).toBe(true);
    m.data.fkGoals = 1; expect(t.update(m).justDone).toBe(true);
    m.data.penGoals = 2; const v = t.update(m);
    expect(v.allDone).toBe(true); expect(v.title).toContain('completo');
    expect(CHALLENGES.length).toBe(6);
  });
  it('con controles faciles se salta el pase alto', () => { const m = mk(); const t = new Training(m, true); expect(t.total).toBe(5); });
  it('el reto del tiro libre pone el balón en su sitio con los conos de barrera y se repite hasta meterlo', () => {
    const m = mk(); const t = new Training(m); const st = newBot('sophie');
    const f = m.players.filter((p) => p.team === 0 && p.role !== 'gk');
    f[0].stats2.passes = 5; t.update(m); f[0].stats2.chips = 2; t.update(m); f[1].stats2.goals = 3; t.update(m); f[1].stats2.spGoals = 1; t.update(m);
    t.update(m);
    expect(m.phase).toBe('restart'); expect(m.restart!.kind).toBe('freekick'); expect(m.restart!.team).toBe(0);
    for (const id of m.restart!.fk!.wall) expect(m.players.find((p) => p.id === id)!.team).toBe(1);
    let done = false;
    for (let i = 0; i < 60 * 240 && !done; i++) { setHumanInput(m, 0, botFrame(m, m.humans[0], st)); step(m); if (i % 6 === 0) done = t.update(m).allDone; }
    expect(done).toBe(true); expect(m.data.fkGoals).toBeGreaterThanOrEqual(1); expect(m.data.fkTries as number).toBeGreaterThanOrEqual(1);
  });
  it('el reto de penales empieza una práctica: solo patea la familia, nadie gana y se vuelve al juego al meter 2', () => {
    const m = mk(); const t = new Training(m); const st = newBot('sophie');
    const f = m.players.filter((p) => p.team === 0 && p.role !== 'gk');
    f[0].stats2.passes = 5; t.update(m); f[0].stats2.chips = 2; t.update(m); f[1].stats2.goals = 3; t.update(m); f[1].stats2.spGoals = 1; t.update(m); m.data.fkGoals = 1; t.update(m);
    for (let i = 0; i < 60 * 20 && m.phase !== 'penalties'; i++) { setHumanInput(m, 0, botFrame(m, m.humans[0], st)); step(m); if (i % 6 === 0) t.update(m); }
    expect(m.phase).toBe('penalties'); expect(m.pen!.practice).toBe(true);
    let done = false, sawRival = false;
    for (let i = 0; i < 60 * 400 && !done; i++) { setHumanInput(m, 0, botFrame(m, m.humans[0], st)); step(m); if (m.pen && m.pen.turn !== 0) sawRival = true; if (i % 6 === 0) done = t.update(m).allDone; }
    expect(done).toBe(true);
    for (let i = 0; i < 60 * 4 && m.pen; i++) { step(m); t.update(m); }   // the practice ends when the celebration of the last goal is over
    expect(sawRival).toBe(false); expect(m.pen).toBeNull(); expect(m.phase).not.toBe('penalties'); expect(m.data.penGoals as number).toBeGreaterThanOrEqual(2);
  });
  it('los ejercicios del menú se repiten sin terminar nunca: tiros libres y penales', () => {
    for (const drill of ['libre', 'penal'] as const) {
      const m = mk(); const t = new Training(m, false, drill); const st = newBot('sophie');
      expect(t.total).toBe(1);
      let sets = 0;
      for (let i = 0; i < 60 * 500 && sets < 2; i++) { setHumanInput(m, 0, botFrame(m, m.humans[0], st)); step(m); if (i % 6 === 0) { const v = t.update(m); expect(v.allDone).toBe(false); if (v.justDone) sets++; } }
      expect(sets, drill).toBe(2);
    }
  });
});
