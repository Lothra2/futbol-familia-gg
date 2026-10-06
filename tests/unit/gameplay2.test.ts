import { describe, expect, it } from 'vitest';
import { createMatch, step } from '../../src/core/match';
import { setHumanInput } from '../../src/core/control';
import { choosePass, segDist } from '../../src/core/actions';
import { T } from '../../src/core/tuning';
import { ball, clear, fam, give, inp, put, rival, secs } from './helpers';
import type { Match } from '../../src/core/state';

const mkB = (humans: { team: 0; slot: number; humanSlot: number; controls: 'full' | 'easy' }[] = []): Match => { const m = createMatch({ ai: 'brain', skipKickoff: true, seed: 3, humans }); for (const p of m.players) p.speedMult = 1; return m; };

describe('mejora 2 (a): pases que llegan', () => {
  it('pase en profundidad: a un compañero que corre hacia adelante el punto de pase va por delante', () => {
    const m = mkB(); clear(m);
    const a = fam(m, 'sophie'), b = fam(m, 'mama'); put(a, 300, 80); put(b, 450, 60); b.vx = 90; b.vy = 0; give(m, a);
    const run = choosePass(m, a, 1, 0)!;
    b.vx = 0;
    const still = choosePass(m, a, 1, 0)!;
    expect(run.x - 450).toBeGreaterThan(still.x - 450 + 25);
    expect(run.id).toBe(b.id);
  });
  it('si nadie está en el cono de 30° se prueba uno de 50° antes de pasar al vacío', () => {
    const m = mkB(); clear(m);
    const a = fam(m, 'sophie'), b = fam(m, 'mama'); put(a, 300, 80); put(b, 420, 80 + 120 * Math.tan(40 * Math.PI / 180)); give(m, a);
    const c = choosePass(m, a, 1, 0);                    // the mate is 40 degrees off the stick: outside 30, inside 50
    expect(c?.id).toBe(b.id);
    put(b, 420, 80 + 120 * Math.tan(60 * Math.PI / 180));
    expect(choosePass(m, a, 1, 0)).toBeNull();
  });
  it('segDist mide la distancia a un segmento', () => {
    expect(segDist(5, 3, 0, 0, 10, 0)).toBeCloseTo(3); expect(segDist(-4, 3, 0, 0, 10, 0)).toBeCloseTo(5); expect(segDist(14, 0, 0, 0, 10, 0)).toBeCloseTo(4);
  });
  it('sin palo, el pase elegido evita al compañero con un rival sobre la línea', () => {
    const m = mkB(); clear(m);
    const a = fam(m, 'sophie'), b = fam(m, 'mama'), c = fam(m, 'papa'), r = rival(m, 3);
    put(a, 300, 80); put(b, 440, 80); put(c, 440, 130); put(r, 370, 80); give(m, a);   // a rival stands in the middle of the line to b
    expect(choosePass(m, a, 0, 0)!.id).toBe(c.id);
  });
  it('los delanteros IA buscan espacio: no se quedan en la línea del que lleva el balón', () => {
    const m = mkB(); clear(m);
    const car = fam(m, 'mama'), f1 = fam(m, 'sophie'), f2 = fam(m, 'alana');
    put(car, 400, 80); give(m, car); car.immuneT = 99;
    put(f1, 380, 60); put(f2, 380, 100);
    for (const r of m.players.filter((p) => p.team === 1 && p.role !== 'gk')) put(r, 560, 80);
    secs(m, 2.5);
    for (const f of [f1, f2]) expect(f.x).toBeGreaterThan(car.x + 30);
  });
  it('una carrera detrás del último defensor, de un delantero cada pocos segundos', () => {
    const m = mkB(); clear(m);
    const car = fam(m, 'mama'), f1 = fam(m, 'sophie'), f2 = fam(m, 'alana');
    put(car, 400, 80); give(m, car); car.immuneT = 99; put(f1, 460, 60); put(f2, 470, 100);
    const rs = m.players.filter((p) => p.team === 1 && p.role !== 'gk'); rs.forEach((r, i) => put(r, 600 + i * 6, 40 + i * 30));
    let ran = 0; for (let i = 0; i < 60 * 5; i++) { step(m); give(m, car); car.immuneT = 99; if ((f1.ai.runUntil ?? 0) > m.t || (f2.ai.runUntil ?? 0) > m.t) ran++; }
    expect(ran).toBeGreaterThan(30);                                     // at least half a second of a run in 5 s
    expect(Math.max(f1.x, f2.x)).toBeGreaterThan(560);                   // one of them got behind the line of the rivals
  });
  it('pasa y se va: quien acaba de pasar corre al espacio delante del receptor', () => {
    const m = mkB(); clear(m);
    const a = fam(m, 'mama'), b = fam(m, 'sophie'); put(a, 300, 80); put(b, 400, 80);
    for (const r of m.players.filter((p) => p.team === 1 && p.role !== 'gk')) put(r, 800, 150);
    give(m, b); b.immuneT = 99; m.lastPass = { from: a.id, to: b.id, t: m.t, team: 0, done: true };
    secs(m, 1.2);
    expect(a.x).toBeGreaterThan(400);                                   // he went past the receiver
  });
  it('la defensa lejana al balón sube a apoyar corto detrás del que lo lleva', () => {
    const m = mkB(); clear(m);
    const car = fam(m, 'sophie'), d1 = fam(m, 'papa'), d2 = fam(m, 'mama');
    put(car, 500, 30); give(m, car); car.immuneT = 99; put(d1, 200, 40); put(d2, 200, 110);
    secs(m, 2.5);
    expect(d2.x).toBeGreaterThan(300);                                   // the defender on the far side (y 110) comes up
    expect(d2.x - d1.x).toBeGreaterThan(40);
  });
  it('T.space tiene los números nuevos', () => { expect(T.space.runFor).toBeGreaterThan(0); expect(T.passConeWide).toBeGreaterThan(T.passCone); });
});
void ball;

describe('mejora 2 (b): centros y líneas de pase', () => {
  it('un pase alto desde la banda en los últimos 220 px va al segundo palo, a un delantero que esté allí', () => {
    const m = mkB([{ team: 0, slot: 3, humanSlot: 0, controls: 'full' }]); clear(m);
    const me = fam(m, 'sophie'), fw = fam(m, 'alana');
    put(me, 800, 20); give(m, me); put(fw, 922, 96); step(m);
    let lob = false, tx = 0;
    setHumanInput(m, 0, inp({ pass: true, passPressed: true })); step(m);
    for (let i = 0; i < 30; i++) { setHumanInput(m, 0, inp({ pass: true })); step(m); }
    setHumanInput(m, 0, inp()); step(m);
    for (let i = 0; i < 30; i++) { step(m); if (m.lastPass && m.lastPass.from === me.id) { lob = true; tx = m.lastPass.to; break; } }
    expect(lob).toBe(true); expect(tx).toBe(fw.id);
  });
  it('un pase alto desde el medio no es un centro (va al compañero que señala el palo)', () => {
    const m = mkB([{ team: 0, slot: 3, humanSlot: 0, controls: 'full' }]); clear(m);
    const me = fam(m, 'sophie'), fw = fam(m, 'alana'), other = fam(m, 'mama');
    put(me, 500, 20); give(m, me); put(fw, 922, 96); put(other, 650, 40); step(m);
    setHumanInput(m, 0, inp({ pass: true, passPressed: true, mx: 1 })); step(m);
    for (let i = 0; i < 30; i++) { setHumanInput(m, 0, inp({ pass: true, mx: 1 })); step(m); }
    setHumanInput(m, 0, inp({ mx: 1 })); step(m);
    for (let i = 0; i < 20; i++) step(m);
    expect(m.lastPass?.to).toBe(other.id);
  });
  it('el receptor de un pase en el aire tiene una ventana de remate 30 % más grande', async () => {
    const { aerialZone } = await import('../../src/core/actions');
    const m = mkB(); clear(m);
    const a = fam(m, 'sophie'), b = fam(m, 'mama'); put(b, 600, 80); a.noControlT = 0;
    ball(m, 600 + T.aerial.dx * 1.15, 80, 36, 0, 0, 0);
    expect(aerialZone(m, b)).toBeNull();
    m.lastPass = { from: a.id, to: b.id, t: m.t, team: 0 };
    expect(aerialZone(m, b)).toBe('header');
  });
  it('un rival Campeón que no presiona corta la línea de pase hacia el más peligroso', () => {
    const m = createMatch({ ai: 'brain', skipKickoff: true, seed: 3, difficulty: 'campeones' }); for (const p of m.players) p.speedMult = 1; clear(m);   // rivals cut lanes only in Campeones
    const car = fam(m, 'sophie'), recv = fam(m, 'mama'), far = rival(m, 4);
    put(car, 400, 80); put(recv, 520, 80); give(m, car); car.immuneT = 99; car.speedMult = recv.speedMult = 0.001;   // the carrier and the receiver stand still
    const rs = m.players.filter((p) => p.team === 1 && p.role !== 'gk'); rs.forEach((r) => put(r, 900, 150));
    const pr = rival(m, 3), pr2 = rival(m, 2); put(pr, 420, 80); pr.speedMult = 0.001; put(pr2, 440, 100); pr2.speedMult = 0.001; put(far, 640, 140);   // two press (Campeones), the third cuts
    for (let i = 0; i < 90; i++) { step(m); give(m, car); car.immuneT = 99; }   // the ball stays with the carrier
    // the lane cutter goes to 55 % of the way between the carrier (400, 80) and his receiver (520, 80): about (466, 80)
    expect(far.x).toBeLessThan(540); expect(Math.abs(far.y - 80)).toBeLessThan(25);
  });
});
