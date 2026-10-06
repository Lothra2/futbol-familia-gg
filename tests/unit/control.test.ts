import { describe, expect, it } from 'vitest';
import { createMatch, step } from '../../src/core/match';
import { setHumanInput } from '../../src/core/control';
import { ball, clear, fam, give, inp, pressPass, put, rival, secs, ticks } from './helpers';
import type { HumanSeat } from '../../src/core/match';
import type { Match } from '../../src/core/state';

const seat = (slot: number, humanSlot: number, controls: 'easy' | 'full' = 'full'): HumanSeat => ({ team: 0, slot, humanSlot, controls });
const mkH = (humans: HumanSeat[]): Match => { const m = createMatch({ ai: 'none', skipKickoff: true, seed: 1, humans }); for (const p of m.players) p.speedMult = 1; return m; };
const ctl = (m: Match, i = 0) => m.players.find((p) => p.id === m.humans[i].id)!;

describe('cambio de jugador al más cercano (GAME_DESIGN 4)', () => {
  it('con el balón en mi equipo manejo al que lo lleva', () => {
    const m = mkH([seat(3, 0)]); clear(m);
    const mama = fam(m, 'mama'); put(mama, 300, 80); give(m, mama);
    step(m);
    expect(ctl(m)).toBe(mama); expect(mama.control).toBe('human'); expect(mama.humanSlot).toBe(0);
    expect(fam(m, 'sophie').control).toBe('ai');
  });
  it('al pasar, el control pasa al que recibe en el mismo paso del pase', () => {
    const m = mkH([seat(3, 0)]); clear(m);
    const a = fam(m, 'sophie'), b = fam(m, 'mama'); put(a, 300, 80); put(b, 480, 80); give(m, a); step(m);
    expect(ctl(m)).toBe(a);
    a.input = inp({ mx: 1, passPressed: true }); setHumanInput(m, 0, a.input);
    let switched = -1;
    for (let i = 0; i < 20 && switched < 0; i++) { step(m); setHumanInput(m, 0, inp({ mx: 1 })); if (ctl(m) === b) switched = i; }
    expect(switched).toBeGreaterThan(-1);
    expect(m.ball.owner).toBeNull();   // the ball is still in the air when the control moves
  });
  it('balón suelto: no cambia antes de 0,5 s desde el último cambio y solo si el otro llega 0,25 s antes', () => {
    const m = mkH([seat(3, 0)]); clear(m);
    const cur = fam(m, 'sophie'), near = fam(m, 'mama'); put(cur, 200, 80); put(near, 460, 80); ball(m, 500, 80, 0, 0, 0, 0);
    step(m); expect(ctl(m)).toBe(cur);                       // too early: 0.5 s have not passed
    secs(m, 0.6); expect(ctl(m)).toBe(near);                 // now he arrives much earlier
    // two players almost equally far: no change
    const m2 = mkH([seat(3, 0)]); clear(m2);
    const c2 = fam(m2, 'sophie'), n2 = fam(m2, 'mama'); put(c2, 400, 80); put(n2, 410, 80); ball(m2, 500, 80, 0, 0, 0, 0);
    secs(m2, 1.0); expect(ctl(m2)).toBe(c2);
  });
  it('controles fáciles: espera 0,8 s y solo cambia si el actual está a más de 80 px del balón', () => {
    const m = mkH([seat(3, 0, 'easy')]); clear(m);
    const cur = fam(m, 'sophie'), near = fam(m, 'mama'); put(cur, 440, 80); put(near, 490, 80); ball(m, 500, 80, 0, 0, 0, 0);
    secs(m, 1.2); expect(ctl(m)).toBe(cur);                  // he is 60 px away: stays
    const f = mkH([seat(3, 0, 'easy')]); clear(f);
    const c2 = fam(f, 'sophie'), n2 = fam(f, 'mama'); put(c2, 200, 80); put(n2, 460, 80); ball(f, 500, 80, 0, 0, 0, 0);
    secs(f, 0.6); expect(ctl(f)).toBe(c2);                   // 0.8 s have not passed
    secs(f, 0.4); expect(ctl(f)).toBe(n2);
  });
  it('Thor, el portero, nunca lo maneja un humano', () => {
    const m = mkH([seat(3, 0)]); clear(m);
    const thor = fam(m, 'thor'); put(thor, 20, 80); give(m, thor); m.ball.state = 'held';
    secs(m, 1.0);
    expect(ctl(m)).not.toBe(thor); expect(thor.control).toBe('ai');
  });
  it('el humano maneja con su stick y sus botones al jugador que le toca', () => {
    const m = mkH([seat(3, 0)]); clear(m);
    const a = fam(m, 'sophie'); put(a, 300, 80); ball(m, 700, 80, 0, 0, 0, 0);
    setHumanInput(m, 0, inp({ mx: 1 })); secs(m, 0.5);
    expect(a.x).toBeGreaterThan(330);
  });
  it('en un saque el humano toma al que saca (si no es el portero)', () => {
    const m = createMatch({ ai: 'none', seed: 1, humans: [seat(3, 0)] });   // starts in a kickoff for the family
    step(m);
    const taker = m.players.find((p) => p.id === m.restart!.taker)!;
    expect(ctl(m)).toBe(taker); expect(taker.control).toBe('human');
  });
  it('con 2 humanos nunca manejan al mismo jugador (900 pasos con el balón rodando por todos lados)', () => {
    const m = mkH([seat(3, 0), seat(4, 1)]); clear(m);
    put(fam(m, 'sophie'), 300, 60); put(fam(m, 'alana'), 340, 100); put(fam(m, 'papa'), 200, 50); put(fam(m, 'mama'), 220, 110);
    for (let i = 0; i < 900; i++) {
      if (i % 60 === 0) ball(m, 100 + ((i * 37) % 700), 20 + ((i * 53) % 120), 0, ((i % 3) - 1) * 80, 0, 0);
      step(m);
      expect(m.humans[0].id).not.toBe(m.humans[1].id);
      const humans = m.players.filter((p) => p.control === 'human');
      expect(humans.length).toBe(2);
      expect(new Set(humans.map((p) => p.humanSlot)).size).toBe(2);
    }
  });
  it('con 2 humanos y el balón de mi equipo en uno de ellos, el otro conserva el suyo', () => {
    const m = mkH([seat(3, 0), seat(4, 1)]); clear(m);
    const a = fam(m, 'sophie'), b = fam(m, 'alana'), c = fam(m, 'mama'); put(a, 300, 60); put(b, 340, 100); put(c, 400, 80); give(m, c);
    step(m);
    expect([m.humans[0].id, m.humans[1].id]).toContain(c.id);
    expect(m.humans[0].id).not.toBe(m.humans[1].id);
  });
});
void rival; void pressPass; void ticks;
