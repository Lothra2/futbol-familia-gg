import { describe, expect, it } from 'vitest';
import { step } from '../../src/core/match';
import { T } from '../../src/core/tuning';
import { DT } from '../../src/core/step';
import { fkMeter, startTrainingFreeKick } from '../../src/core/freekick';
import { ball, clear, fam, give, mk, put, rival, secs, ticks, inp } from './helpers';

/** The family carries the ball at x and a rival slides into his legs: the foul of a slide near the goal of the one who slides. */
function foul(m: ReturnType<typeof mk>, x: number, carrierTeam: 0 | 1 = 0): { carrier: ReturnType<typeof fam>; slider: ReturnType<typeof rival> } {
  clear(m);
  const carrier = carrierTeam === 0 ? fam(m, 'sophie') : rival(m, 3), slider = carrierTeam === 0 ? rival(m, 4) : fam(m, 'papa');
  const dir = carrierTeam === 0 ? 1 : -1;
  put(carrier, x, 80); carrier.facing = dir; give(m, carrier);
  // the slider comes from behind (the ball is in front of the carrier, so the legs are the first thing he reaches)
  put(slider, x - dir * 34, 80); slider.facing = dir as 1 | -1; slider.dirX = dir; slider.immuneT = 0;
  slider.input = inp({ shootPressed: true, slide: true, mx: dir }); step(m); slider.input = inp();
  return { carrier, slider };
}

describe('tiro libre por barrida a la pierna', () => {
  it('una barrida que derriba al que lleva el balón cerca del arco del que barre es tiro libre con barrera de 2', () => {
    const m = mk({}, true); foul(m, 760);
    ticks(m, 24);
    expect(m.phase).toBe('restart'); expect(m.restart!.kind).toBe('freekick'); expect(m.restart!.team).toBe(0);
    const fk = m.restart!.fk!;
    expect(fk.wall).toHaveLength(T.free.wall);
    for (const id of fk.wall) expect(m.players.find((p) => p.id === id)!.team).toBe(1);
    expect(m.restart!.taker).not.toBe(fk.fouled);
    const d = Math.abs(960 - m.restart!.x);
    expect(d).toBeGreaterThanOrEqual(T.free.minDist); expect(d).toBeLessThanOrEqual(T.free.maxDist);
  });
  it('lejos del arco no es falta: el juego sigue', () => {
    const m = mk({}, true); foul(m, 450);
    ticks(m, 24);
    expect(m.phase).toBe('play');
  });
  it('hay una pausa de 25 s entre tiros libres y el entrenamiento no tiene faltas', () => {
    const m = mk({}, true); m.data.fkAt = m.t; foul(m, 760); ticks(m, 24);
    expect(m.phase).toBe('play');
    const t = mk({ training: true }, true); foul(t, 760); ticks(t, 24);
    expect(t.phase).toBe('play');
  });
  it('si el que barre es la familia, el tiro libre es del rival y lo patea la IA sola', () => {
    const m = mk({ seed: 3 });
    foul(m, 200, 1);
    ticks(m, 24);
    expect(m.restart?.kind).toBe('freekick'); expect(m.restart!.team).toBe(1);
    secs(m, 3);
    expect(m.phase).not.toBe('restart'); expect(m.data.fkTaken).toBe(1);
  });
  it('mientras apunta, el stick sube y baja la mira y empujar hacia el arco da más efecto', () => {
    const m = mk({}, true); foul(m, 760); ticks(m, 24);
    const t = m.players.find((p) => p.id === m.restart!.taker)!, fk = m.restart!.fk!;
    secs(m, 1);
    const y0 = fk.aimY, c0 = fk.curve;
    secs(m, 0.5, () => { t.input = inp({ my: 1, mx: 1 }); });
    expect(fk.aimY).toBeGreaterThan(y0 + 20); expect(fk.curve).toBeGreaterThan(c0);
    secs(m, 2, () => { t.input = inp({ my: -1, mx: -1 }); });
    expect(fk.aimY).toBeLessThan(y0); expect(fk.curve).toBe(0);
  });
  /** Taps Tiro for one step. */
  const tap = (m: ReturnType<typeof mk>, t: ReturnType<typeof fam>): void => { t.input = inp({ shootPressed: true }); step(m); t.input = inp(); };
  it('el primer Tiro arranca el medidor y no patea; el segundo patea', () => {
    const m = mk({}, true); foul(m, 760); ticks(m, 24);
    const r = m.restart!, t = m.players.find((p) => p.id === r.taker)!;
    secs(m, 1);
    tap(m, t);
    expect(m.restart!.fk!.stage).toBe('meter'); expect(m.phase).toBe('restart');
    tap(m, t);
    expect(m.phase).toBe('play');
  });
  it('un Tiro antes de que el que patea esté listo no se pierde ni patea solo', () => {
    const m = mk({}, true); foul(m, 760); ticks(m, 24);
    const t = m.players.find((p) => p.id === m.restart!.taker)!;
    tap(m, t);
    expect(m.restart!.fk!.stage).toBe('aim'); expect(m.phase).toBe('restart');
    secs(m, 1); tap(m, t);
    expect(m.restart!.fk!.stage).toBe('meter');
  });
  it('si el medidor termina sin tocar, vuelve a apuntar (no se pierde nada)', () => {
    const m = mk({}, true); foul(m, 760); ticks(m, 24);
    const t = m.players.find((p) => p.id === m.restart!.taker)!;
    secs(m, 1); tap(m, t);
    secs(m, T.free.sweep + 0.1);
    expect(m.phase).toBe('restart'); expect(m.restart!.fk!.stage).toBe('aim');
  });
  it('en el entrenamiento no hay límite de tiempo y en el partido el tiro sale solo mucho después', () => {
    const tr = mk({ training: true }, true); startTrainingFreeKick(tr); secs(tr, 40);
    expect(tr.phase).toBe('restart');
    const m = mk({}, true); foul(m, 760); ticks(m, 24); secs(m, T.free.auto - 2);
    expect(m.phase).toBe('restart'); expect(m.data.fkTaken ?? 0).toBe(0); secs(m, 4);
    expect(m.data.fkTaken).toBe(1);
  });
  it('en el punto alto de la barra el balón pasa por encima de la barrera y no es de ellos', () => {
    const m = mk({}, true); foul(m, 760); ticks(m, 24);
    const r = m.restart!, t = m.players.find((p) => p.id === r.taker)!;
    secs(m, 1); tap(m, t);
    while (m.restart && fkMeter(m.restart.fk!, m.restart.t) < T.free.sweet) { t.input = inp(); step(m); }
    tap(m, t);
    expect(m.phase).toBe('play');
    let rivalHad = false;
    secs(m, 0.8, () => { const o = m.players.find((p) => p.id === m.ball.owner); if (o && o.team === 1 && o.role !== 'gk') rivalHad = true; });
    expect(rivalHad).toBe(false);
  });
  it('con mal tiempo (segundo Tiro nada más empezar el medidor) el balón sale bajo y se lo queda la barrera', () => {
    const m = mk({}, true); foul(m, 760); ticks(m, 24);
    const t = m.players.find((p) => p.id === m.restart!.taker)!;
    secs(m, 1); tap(m, t); tap(m, t);
    let rivalHad = false;
    secs(m, 0.8, () => { const o = m.players.find((p) => p.id === m.ball.owner); if (o && o.team === 1) rivalHad = true; });
    expect(rivalHad).toBe(true);
  });
  it('un gol de tiro libre cuenta aunque se haya tardado en apuntar', () => {
    const m = mk({}, true); foul(m, 760); ticks(m, 24);
    const t = m.players.find((p) => p.id === m.restart!.taker)!;
    secs(m, 12);            // a long time aiming
    secs(m, 0); tap(m, t);
    while (m.restart && fkMeter(m.restart.fk!, m.restart.t) < T.free.sweet) { t.input = inp(); step(m); }
    tap(m, t);
    // the ball goes into the net: put it there as the shot would
    ball(m, 955, 80, 5, 300, 0, 0);
    secs(m, 0.5);
    expect(m.score[0]).toBe(1); expect(m.data.fkGoals).toBe(1);
  });
  it('la barrera no se mueve mientras se apunta', () => {
    const m = mk({}, true); foul(m, 760); ticks(m, 24);
    const ids = m.restart!.fk!.wall, at = ids.map((id) => { const p = m.players.find((q) => q.id === id)!; return [p.x, p.y]; });
    secs(m, 1.2);
    ids.forEach((id, i) => { const p = m.players.find((q) => q.id === id)!; expect([p.x, p.y]).toEqual(at[i]); });
  });
  it('tras cualquier tiro libre vuelve a sonar el partido y el reloj sigue', () => {
    const m = mk({}, true); foul(m, 760); ticks(m, 24);
    const c = m.clock, t = m.players.find((p) => p.id === m.restart!.taker)!;
    secs(m, 1); tap(m, t); secs(m, 0.3); tap(m, t);
    secs(m, 8);
    expect(m.data.fkTaken).toBe(1); expect(m.clock).toBeGreaterThan(c);
    void ball; void DT;
  });
});
