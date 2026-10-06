import { describe, expect, it } from 'vitest';
import { createMatch, step } from '../../src/core/match';
import { setHumanInput } from '../../src/core/control';
import { stealTarget } from '../../src/core/actions';
import { T } from '../../src/core/tuning';
import { ball, clear, fam, give, inp, put, rival, secs } from './helpers';
import type { HumanSeat } from '../../src/core/match';
import type { Match } from '../../src/core/state';

const seat = (slot: number, controls: 'easy' | 'full' = 'full'): HumanSeat => ({ team: 0, slot, humanSlot: 0, controls });
const mkH = (controls: 'easy' | 'full' = 'full', ai: 'none' | 'brain' = 'none', seed = 1): Match => { const m = createMatch({ ai, skipKickoff: true, seed, humans: [seat(3, controls)] }); for (const p of m.players) p.speedMult = 1; return m; };
const ctl = (m: Match) => m.players.find((p) => p.id === m.humans[0].id)!;
/** The human defends: Sophie at (300, 80) facing right, a rival with the ball at `gap` px in front. */
function defend(gap: number, dyc = 0, controls: 'easy' | 'full' = 'full', seed = 1): { m: Match; me: ReturnType<typeof ctl>; r: ReturnType<typeof rival> } {
  const m = mkH(controls, 'none', seed); clear(m);
  const me = fam(m, 'sophie'); put(me, 300, 80); me.facing = 1;
  const r = rival(m, 3); put(r, 300 + gap, 80 + dyc); r.facing = -1; give(m, r); r.immuneT = 0;
  for (let i = 0; i < 40; i++) { setHumanInput(m, 0, inp()); step(m); give(m, r); r.immuneT = 0; }   // let the control settle on Sophie
  return { m, me, r };
}

describe('mejora 1: defender', () => {
  it('Tiro con el rival al frente y a alcance roba de frente (nunca barrida)', () => {
    const { m, me } = defend(15);
    expect(ctl(m)).toBe(me);
    setHumanInput(m, 0, inp({ shoot: true, shootPressed: true })); step(m);
    expect(me.state).not.toBe('slide'); expect(me.cd.steal).toBeGreaterThan(0);
  });
  it('Tiro lejos (30 px) hace barrida como siempre', () => {
    const { m, me } = defend(30);
    setHumanInput(m, 0, inp({ shoot: true, shootPressed: true })); step(m);
    expect(me.state).toBe('slide'); expect(me.cd.steal).toBe(0);
  });
  it('la marca del robo (stealTarget) aparece solo cuando el robo de frente es posible', () => {
    const near = defend(15), far = defend(40);
    expect(stealTarget(near.m, near.me)).toBe(near.r); expect(stealTarget(far.m, far.me)).toBeNull();
  });
  it('un robo con éxito da el balón y la barra del equipo', () => {
    let won = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const { m, me } = defend(15, 0, 'full', seed);
      setHumanInput(m, 0, inp({ shoot: true, shootPressed: true })); step(m);
      if (m.ball.owner === me.id) won++;
    }
    expect(won).toBeGreaterThan(8); expect(won).toBeLessThan(28);   // about 55 % of the time
  });
  it('mantener Pase contiene: se coloca entre el rival y su arco a unos 14 px y lo frena', () => {
    const { m, me, r } = defend(60, 10);
    r.input = inp();   // the rival stands still with the ball
    for (let i = 0; i < 90; i++) { setHumanInput(m, 0, inp({ pass: true, passPressed: i === 0 })); step(m); give(m, r); r.immuneT = 0; r.vx = r.vy = 0; }
    expect(me.containT ?? 0).toBeGreaterThan(T.contain.after);
    const d = Math.hypot(me.x - r.x, me.y - r.y);
    expect(d).toBeGreaterThan(8); expect(d).toBeLessThan(22);
    expect(me.x).toBeLessThan(r.x);                              // on the side of his own goal (team 0 defends x = 0)
    expect(ctl(m)).toBe(me);                                      // the control did not wander off
  });
  it('contener frena al que lleva el balón y sube la probabilidad del robo', () => {
    const { m, me, r } = defend(20);
    for (let i = 0; i < 60; i++) { setHumanInput(m, 0, inp({ pass: true, passPressed: i === 0 })); step(m); give(m, r); r.immuneT = 0; }
    expect(r.slowT).toBeGreaterThan(0);
    expect(me.containT ?? 0).toBeGreaterThanOrEqual(T.contain.after);
  });
  it('un toque corto de Pase no contiene (cambia de jugador)', () => {
    const { m, me } = defend(50);
    setHumanInput(m, 0, inp({ pass: true, passPressed: true })); step(m);
    for (let i = 0; i < 4; i++) { setHumanInput(m, 0, inp()); step(m); }
    expect(me.containT ?? 0).toBe(0);
  });
  it('con controles fáciles mantener el botón no contiene y el rival no recibe barridas', () => {
    const { m, me } = defend(30, 0, 'easy');
    for (let i = 0; i < 40; i++) { setHumanInput(m, 0, inp({ pass: true, passPressed: i === 0 })); step(m); }
    expect(me.containT ?? 0).toBe(0);
  });
  it('el compañero IA más cercano corta la línea de pase mientras el humano contiene', () => {
    const m = mkH('full', 'brain'); clear(m);
    const me = fam(m, 'sophie'), mate = fam(m, 'mama'), r = rival(m, 3), r2 = rival(m, 4);
    put(me, 300, 80); me.facing = 1; put(r, 330, 80); give(m, r); put(r2, 600, 40); put(mate, 360, 120);
    for (let i = 0; i < 20; i++) { setHumanInput(m, 0, inp()); step(m); give(m, r); r.immuneT = 0; r.vx = r.vy = 0; }
    for (let i = 0; i < 100; i++) { setHumanInput(m, 0, inp({ pass: true, passPressed: i === 0 })); step(m); give(m, r); r.immuneT = 0; r.vx = r.vy = 0; put(r2, 600, 40); }
    expect(ctl(m)).toBe(me);
    // the mate stands in the corridor between the carrier and his best receiver instead of lunging at the carrier
    expect(Math.hypot(mate.x - r.x, mate.y - r.y)).toBeGreaterThan(40);
  });
});
