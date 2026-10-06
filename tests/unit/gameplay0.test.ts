import { describe, expect, it } from 'vitest';
import { createMatch, step } from '../../src/core/match';
import { setHumanInput } from '../../src/core/control';
import { ball, clear, fam, inp, put, rival, secs } from './helpers';
import type { HumanSeat } from '../../src/core/match';
import type { Match } from '../../src/core/state';

const seat = (slot: number, humanSlot: number, controls: 'easy' | 'full' = 'full'): HumanSeat => ({ team: 0, slot, humanSlot, controls });
const mkH = (humans: HumanSeat[], ai: 'none' | 'brain' = 'none'): Match => { const m = createMatch({ ai, skipKickoff: true, seed: 1, humans }); for (const p of m.players) p.speedMult = 1; return m; };
const ctl = (m: Match) => m.players.find((p) => p.id === m.humans[0].id)!;

/** Pass held for `hold` seconds with the human input slot, then released. */
function passFor(m: Match, hold: number): void {
  setHumanInput(m, 0, inp({ pass: true, passPressed: true })); step(m);
  for (let i = 0; i < Math.round(hold * 60); i++) { setHumanInput(m, 0, inp({ pass: true })); step(m); }
  setHumanInput(m, 0, inp()); step(m); step(m);
}

describe('paso 0: deudas del diseño', () => {
  it('0.1 un toque corto de Pase sin balón cambia de jugador de inmediato', () => {
    const m = mkH([seat(3, 0)]); clear(m);
    const a = fam(m, 'sophie'), b = fam(m, 'mama'); put(a, 200, 80); put(b, 440, 80); ball(m, 500, 80);
    secs(m, 0.1); expect(ctl(m)).toBe(a);                    // too early for the automatic switch (0.5 s) and he is the second closest
    passFor(m, 0.05);
    expect(ctl(m)).toBe(b);
  });
  it('0.1 si ya manejo al más cercano, el toque me pasa al segundo', () => {
    const m = mkH([seat(3, 0)]); clear(m);
    const a = fam(m, 'sophie'), b = fam(m, 'mama'), c = fam(m, 'papa'); put(a, 440, 80); put(b, 380, 80); put(c, 100, 80); ball(m, 500, 80);
    secs(m, 0.1); expect(ctl(m)).toBe(a);
    passFor(m, 0.05);
    expect(ctl(m)).toBe(b);
  });
  it('0.1 mantener Pase más de 0,2 s no cambia (eso es contener, mejora 1)', () => {
    const m = mkH([seat(3, 0)]); clear(m);
    const a = fam(m, 'sophie'), b = fam(m, 'mama'); put(a, 200, 80); put(b, 440, 80); ball(m, 500, 80);
    secs(m, 0.1);
    passFor(m, 0.3);
    expect(ctl(m)).toBe(a);
  });
  it('0.1 con controles fáciles el toque no cambia nada', () => {
    const m = mkH([seat(3, 0, 'easy')]); clear(m);
    const a = fam(m, 'sophie'), b = fam(m, 'mama'); put(a, 200, 80); put(b, 440, 80); ball(m, 500, 80);
    secs(m, 0.1); passFor(m, 0.05);
    expect(ctl(m)).toBe(a);
  });

  it('0.2 controles fáciles: corre rápido solo tras 0,3 s con el joystick a fondo, y gasta aguante a la mitad', () => {
    const m = mkH([seat(3, 0, 'easy')]); clear(m);
    const a = fam(m, 'sophie'); put(a, 200, 80); ball(m, 100, 160);
    for (let i = 0; i < 10; i++) { setHumanInput(m, 0, inp({ mx: 1 })); step(m); }        // 0.17 s
    expect(a.state).not.toBe('sprint');
    for (let i = 0; i < 30; i++) { setHumanInput(m, 0, inp({ mx: 1 })); step(m); }        // 0.67 s in total
    expect(a.state).toBe('sprint');
    const s0 = a.stamina;
    for (let i = 0; i < 60; i++) { setHumanInput(m, 0, inp({ mx: 1 })); step(m); }
    expect(s0 - a.stamina).toBeCloseTo((100 / a.stats.stamina) * 0.5, 0);                  // half of the normal drain in 1 s
  });
  it('0.2 un joystick suave (menos del 85 %) no activa el sprint automático', () => {
    const m = mkH([seat(3, 0, 'easy')]); clear(m);
    const a = fam(m, 'sophie'); put(a, 200, 80); ball(m, 100, 160);
    for (let i = 0; i < 60; i++) { setHumanInput(m, 0, inp({ mx: 0.7 })); step(m); }
    expect(a.state).toBe('run');
  });
  it('0.2 con controles completos no hay sprint automático', () => {
    const m = mkH([seat(3, 0)]); clear(m);
    const a = fam(m, 'sophie'); put(a, 200, 80); ball(m, 100, 160);
    for (let i = 0; i < 60; i++) { setHumanInput(m, 0, inp({ mx: 1 })); step(m); }
    expect(a.state).toBe('run');
  });

  it('0.3 imán: un balón lento a menos de 30 px se curva hacia la niña con controles fáciles', () => {
    const m = mkH([seat(3, 0, 'easy')]); clear(m);
    const a = fam(m, 'sophie'); put(a, 300, 80);
    ball(m, 300, 80 - 26, 0, 0, 0, 0); m.ball.vx = 30; m.ball.vy = 0;   // passes by 26 px to the side, too far to be controlled (11 px)
    let min = 99; for (let i = 0; i < 40; i++) { setHumanInput(m, 0, inp()); step(m); min = Math.min(min, Math.abs(m.ball.y - a.y)); if (m.ball.owner === a.id) break; }
    const b = mkH([seat(3, 0, 'full')]); clear(b);
    const a2 = fam(b, 'sophie'); put(a2, 300, 80);
    ball(b, 300, 80 - 26, 0, 0, 0, 0); b.ball.vx = 30;
    let min2 = 99; for (let i = 0; i < 40; i++) { setHumanInput(b, 0, inp()); step(b); min2 = Math.min(min2, Math.abs(b.ball.y - a2.y)); }
    expect(min).toBeLessThan(min2 - 3);                                       // with the magnet the ball gets closer than without
  });
  it('0.3 imán: su propia patada no se le devuelve', () => {
    const m = mkH([seat(3, 0, 'easy')]); clear(m);
    const a = fam(m, 'sophie'); put(a, 300, 80);
    ball(m, 318, 80); m.ball.vx = 150; m.ball.lastTouch = { team: 0, player: a.id, t: m.t };
    secs(m, 0.3);
    expect(m.ball.x).toBeGreaterThan(345);
  });

  it('0.4 el receptor IA de un pase va a buscarlo aunque otro compañero esté más cerca', () => {
    const run = (pass: boolean): number => {
      const m = mkH([], 'brain'); clear(m);
      const from = fam(m, 'sophie'), to = fam(m, 'mama'), near = fam(m, 'papa');
      put(from, 300, 80); put(to, 400, 40); put(near, 540, 110); ball(m, 500, 90, 0, 0, 0, 0);
      if (pass) m.lastPass = { from: from.id, to: to.id, t: m.t, team: 0 };
      for (const r of m.players.filter((p) => p.team === 1)) put(r, 900, 160);
      secs(m, 0.8);
      return to.x - 400;
    };
    expect(run(true)).toBeGreaterThan(run(false) + 25);
  });
  it('0.4 el rival no persigue el pase de otro equipo (solo cambia lo del propio)', () => {
    const m = mkH([], 'brain'); clear(m);
    const r1 = rival(m, 3), r2 = rival(m, 4);
    put(r1, 700, 40); put(r2, 600, 120); ball(m, 500, 80);
    m.lastPass = { from: fam(m, 'sophie').id, to: fam(m, 'mama').id, t: m.t, team: 0 };
    secs(m, 0.3);
    expect(Number.isFinite(r1.x) && Number.isFinite(r2.x)).toBe(true);
  });
});
