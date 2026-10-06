import { describe, expect, it } from 'vitest';
import { step } from '../../src/core/match';
import { T } from '../../src/core/tuning';
import { DT } from '../../src/core/step';
import { fkMeter } from '../../src/core/freekick';
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
  it('en el punto alto de la barra el balón pasa por encima de la barrera y no es de ellos', () => {
    const m = mk({}, true); foul(m, 760); ticks(m, 24);
    const r = m.restart!, t = m.players.find((p) => p.id === r.taker)!;
    while (m.restart && fkMeter(m.restart.t) < T.free.sweet) { t.input = inp(); step(m); }
    t.input = inp({ shootPressed: true }); step(m); t.input = inp();
    expect(m.phase).toBe('play');
    let rivalHad = false;
    secs(m, 0.8, () => { const o = m.players.find((p) => p.id === m.ball.owner); if (o && o.team === 1 && o.role !== 'gk') rivalHad = true; });
    expect(rivalHad).toBe(false);
  });
  it('con mal tiempo el balón sale bajo y se lo queda la barrera', () => {
    const m = mk({}, true); foul(m, 760); ticks(m, 24);
    const r = m.restart!, t = m.players.find((p) => p.id === r.taker)!;
    while (m.restart && m.restart.t < T.restart.position + 0.1) { t.input = inp(); step(m); }
    t.input = inp({ shootPressed: true }); step(m); t.input = inp();
    let rivalHad = false;
    secs(m, 0.8, () => { const o = m.players.find((p) => p.id === m.ball.owner); if (o && o.team === 1) rivalHad = true; });
    expect(rivalHad).toBe(true);
  });
  it('la barrera no se mueve mientras se apunta', () => {
    const m = mk({}, true); foul(m, 760); ticks(m, 24);
    const ids = m.restart!.fk!.wall, at = ids.map((id) => { const p = m.players.find((q) => q.id === id)!; return [p.x, p.y]; });
    secs(m, 1.2);
    ids.forEach((id, i) => { const p = m.players.find((q) => q.id === id)!; expect([p.x, p.y]).toEqual(at[i]); });
  });
  it('tras cualquier tiro libre vuelve a sonar el partido y el reloj sigue', () => {
    const m = mk({}, true); foul(m, 760); ticks(m, 24);
    const c = m.clock;
    secs(m, 8);
    expect(m.phase).not.toBe('restart'); expect(m.clock).toBeGreaterThan(c);
    void ball; void DT;
  });
});
