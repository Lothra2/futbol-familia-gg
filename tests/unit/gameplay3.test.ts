import { describe, expect, it } from 'vitest';
import { step } from '../../src/core/match';
import { saveChance, keeperParams } from '../../src/core/ai/keeper';
import { shotQuality } from '../../src/core/chance';
import { planShot } from '../../src/core/actions';
import { T } from '../../src/core/tuning';
import { ball, clear, fam, give, inp, mk, pressShoot, put, rival, secs, untilKick } from './helpers';

describe('mejora 3: tirar con criterio', () => {
  it('la puntería sigue al joystick de forma continua (80 más o menos 18)', () => {
    const m = mk({}, true); clear(m); const p = fam(m, 'sophie'); put(p, 800, 80); give(m, p);
    const ty = (my: number): number => { p.input = inp({ my }); return planShot(m, p, 0).ty; };
    expect(ty(0)).toBe(80); expect(ty(0.1)).toBe(80);
    expect(ty(0.5)).toBeCloseTo(80 + 0.5 * T.chance.aim, 5); expect(ty(-0.5)).toBeCloseTo(80 - 0.5 * T.chance.aim, 5);
    expect(ty(1)).toBeCloseTo(80 + T.chance.aim, 5); expect(ty(-1)).toBeCloseTo(80 - T.chance.aim, 5); expect(ty(3)).toBeCloseTo(80 + T.chance.aim, 5);
  });
  it('el error de un tiro tocado es 6 y crece con la fuerza hasta 14', () => {
    const m = mk({}, true); clear(m); const p = fam(m, 'sophie'); put(p, 800, 80); give(m, p);
    expect(planShot(m, p, 0).err).toBe(6);
    expect(planShot(m, p, T.hardTime).err).toBeCloseTo(14, 5);
  });
  it('calidad de ocasión: cerca vale más que lejos, la banda y el tráfico la bajan, y de primera la sube', () => {
    const m = mk({}, true); clear(m); const p = fam(m, 'sophie'), gk = m.players.find((q) => q.team === 1 && q.role === 'gk')!;
    put(gk, 945, 80); put(p, 900, 80); give(m, p); ball(m, 900, 80); m.ball.state = 'owned'; m.ball.owner = p.id;
    const near = shotQuality(m, p, 70, false);
    ball(m, 700, 80); m.ball.state = 'owned'; m.ball.owner = p.id;
    const far = shotQuality(m, p, 70, false);
    expect(near).toBeGreaterThan(far + 0.3); expect(far).toBeGreaterThan(0.1);
    ball(m, 900, 10); m.ball.state = 'owned'; m.ball.owner = p.id;
    const wing = shotQuality(m, p, 70, false);
    ball(m, 900, 80); m.ball.state = 'owned'; m.ball.owner = p.id;
    expect(wing).toBeLessThan(near);
    const rv = rival(m, 3); put(rv, 930, 80);
    const blocked = shotQuality(m, p, 70, false);
    expect(blocked).toBeLessThan(near);
    expect(shotQuality(m, p, 70, true)).toBeGreaterThan(blocked);
    put(rv, 300, 150);
    // into the corner away from the keeper: better than at the keeper (from 150 px, where the quality is not at its ceiling)
    ball(m, 810, 80); m.ball.state = 'owned'; m.ball.owner = p.id;
    expect(shotQuality(m, p, 98, false)).toBeGreaterThan(shotQuality(m, p, 82, false));
    expect(shotQuality(m, p, 100, true)).toBeLessThanOrEqual(1);
  });
  it('el portero ataja menos una buena ocasión y más una mala (a igual tiro)', () => {
    const m = mk({}, true); const gk = m.players.find((q) => q.team === 1 && q.role === 'gk')!; const k = keeperParams(m, gk);
    expect(saveChance(k, 200, 0, 0, 1)).toBeLessThan(saveChance(k, 200, 0, 0, T.chance.neutral));
    expect(saveChance(k, 200, 0, 0, 0.1)).toBeGreaterThan(saveChance(k, 200, 0, 0, T.chance.neutral));
    expect(saveChance(k, 200, 0, 0)).toBeCloseTo(saveChance(k, 200, 0, 0, T.chance.neutral), 10);   // no quality given: neutral
  });
  it('tiro de primera: Tiro apretado antes de que llegue el balón se patea al llegar, y no es una barrida', () => {
    const m = mk({}, true); clear(m);
    const p = fam(m, 'sophie'); put(p, 800, 80); p.facing = 1;
    ball(m, 880, 80, 0, -300, 0, 0);                             // a pass rolling towards him, a fraction of a second away
    for (let i = 0; i < 8; i++) { p.input = inp(); step(m); }
    p.input = inp({ shoot: true, shootPressed: true }); step(m);
    p.input = inp();
    expect(p.state).not.toBe('slide'); expect(p.buf).toBeTruthy();
    let kicked = false, first = false;
    for (let i = 0; i < 40 && !kicked; i++) { step(m); if (p.act?.kind === 'kick') { kicked = true; first = !!p.act.plan?.first; } }
    expect(kicked).toBe(true); expect(first).toBe(true);
  });
  it('sin balón que llegue, Tiro sigue siendo barrida y no deja nada guardado', () => {
    const m = mk({}, true); clear(m); const p = fam(m, 'sophie'); put(p, 800, 80); ball(m, 400, 80);
    p.input = inp({ shoot: true, shootPressed: true }); step(m);
    expect(p.state).toBe('slide'); expect(p.buf ?? null).toBeNull();
  });
  it('la orden guardada caduca si el balón no llega', () => {
    const m = mk({}, true); clear(m); const p = fam(m, 'sophie'); put(p, 800, 80);
    ball(m, 880, 80, 0, -300, 0, 0);
    for (let i = 0; i < 8; i++) { p.input = inp(); step(m); }
    p.input = inp({ shoot: true, shootPressed: true }); step(m); p.input = inp();
    expect(p.buf).toBeTruthy();
    ball(m, 400, 150);                                           // the ball goes away
    secs(m, T.buffer + 0.1);
    expect(p.buf ?? null).toBeNull();
  });
  it('vaselina: un tiro tocado con el portero adelantado y cerca es un globo sobre él, y no cuenta como pase', () => {
    const m = mk({}, true); clear(m); const p = fam(m, 'sophie'), gk = m.players.find((q) => q.team === 1 && q.role === 'gk')!;
    put(p, 880, 80); give(m, p); put(gk, 935, 80);                // 25 px off his line (the line is x 960), 55 px from the shooter
    const plan = planShot(m, p, 0);
    expect(plan.vaselina).toBe(true); expect(plan.kind).toBe('chip');
    const shots0 = p.stats2.shots; pressShoot(m, p, 0); untilKick(m);
    expect(p.stats2.shots).toBe(shots0 + 1); expect(m.lastPass).toBeNull();
    expect(m.ball.vz).toBeGreaterThan(0);
  });
  it('sin portero adelantado o con un tiro cargado no hay vaselina', () => {
    const m = mk({}, true); clear(m); const p = fam(m, 'sophie'), gk = m.players.find((q) => q.team === 1 && q.role === 'gk')!;
    put(p, 880, 80); give(m, p); put(gk, 955, 80);
    expect(planShot(m, p, 0).vaselina).toBeUndefined();
    put(gk, 935, 80); expect(planShot(m, p, T.hardTime).vaselina).toBeUndefined();
    expect(planShot(m, p, 0, true).vaselina).toBeUndefined();     // the assisted shot of the easy controls
  });
});
