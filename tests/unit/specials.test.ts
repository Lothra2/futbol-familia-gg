import { describe, expect, it } from 'vitest';
import { createMatch, step } from '../../src/core/match';
import { setHumanInput } from '../../src/core/control';
import { addBar, barMult, flightDur, flightPos, launchSpecial, specialChance, specialKind, updateBar } from '../../src/core/specials';
import { T } from '../../src/core/tuning';
import { PITCH } from '../../src/core/field';
import { ball, clear, fam, give, inp, mk, put, rival, secs, ticks } from './helpers';
import type { HumanSeat } from '../../src/core/match';
import type { Flight, Match, SpecialKind } from '../../src/core/state';

const seat = (slot: number, controls: 'easy' | 'full' = 'full'): HumanSeat => ({ team: 0, slot, humanSlot: 0, controls });
/** A match with one human seated at `slot`, bar full, the character `c` with the ball at x. */
function ready(c: 'sophie' | 'alana' | 'papa' | 'mama', x: number, o: { cine?: 'full' | 'short' | 'off'; seed?: number; controls?: 'easy' | 'full' } = {}): Match {
  const slot = { sophie: 3, alana: 4, papa: 1, mama: 2 }[c];
  const m = createMatch({ ai: 'none', skipKickoff: true, seed: o.seed ?? 1, humans: [seat(slot, o.controls ?? 'full')], cine: o.cine ?? 'full' });
  for (const p of m.players) p.speedMult = 1;
  clear(m); const p = fam(m, c); put(p, x, 80); give(m, p); m.bar[0] = 100;
  step(m);
  return m;
}
const press = (m: Match): void => { setHumanInput(m, 0, inp({ specialPressed: true })); step(m); setHumanInput(m, 0, null); };

describe('Barra Estrella', () => {
  it('se carga con pases, robos, tiros, el balón en campo rival y los goles recibidos, y no pasa de 100', () => {
    const m = mk();
    addBar(m, 0, T.bar.pass); expect(m.bar[0]).toBe(5);
    addBar(m, 1, T.bar.conceded); expect(m.bar[1]).toBeCloseTo(8 * 0.75, 5);   // rivals at Normales charge x0.75
    addBar(m, 0, 500); expect(m.bar[0]).toBe(100);
    ball(m, 700, 80); const before = m.bar[0], b1 = m.bar[1]; m.bar[0] = 0;
    secs(m, 2); expect(m.bar[0]).toBeGreaterThan(2.5); expect(m.bar[0]).toBeLessThan(3.5);   // 1.5 per second in the half it attacks
    expect(m.bar[1]).toBe(b1); void before;
  });
  it('los controles fáciles cargan x1,4 y los rivales según la dificultad', () => {
    const e = createMatch({ ai: 'none', skipKickoff: true, humans: [seat(3, 'easy')] }); expect(barMult(e, 0)).toBe(1.4);
    const f = createMatch({ ai: 'none', skipKickoff: true, humans: [seat(3, 'full')] }); expect(barMult(f, 0)).toBe(1);
    for (const [d, v] of [['tranquilos', 0.5], ['normales', 0.75], ['campeones', 1.0]] as const) expect(barMult(createMatch({ ai: 'none', difficulty: d }), 1)).toBe(v);
  });
  it('avisa una sola vez cuando se llena', () => {
    const m = mk(); m.events = [];
    addBar(m, 0, 60); addBar(m, 0, 60); addBar(m, 0, 60);
    expect(m.events.filter((e) => e.k === 'starfull').length).toBe(1);
  });
  it('un pase completado carga la barra y un robo también', () => {
    const m = mk({}, true); clear(m); const a = fam(m, 'sophie'), b = fam(m, 'mama'); put(a, 300, 80); put(b, 440, 80); give(m, a);
    a.input = inp({ mx: 1, passPressed: true }); step(m); a.input = inp();
    for (let i = 0; i < 120 && m.ball.owner !== b.id; i++) step(m);
    expect(m.bar[0]).toBeGreaterThanOrEqual(5);
  });
});

describe('lanzar el especial (B18)', () => {
  it('con la barra llena y el balón, el humano lanza: la fase pasa a cinemática y la barra se vacía', () => {
    const m = ready('sophie', 300);
    press(m);
    expect(m.phase).toBe('cinematic'); expect(m.bar[0]).toBe(0); expect(m.special!.kind).toBe('arcoiris'); expect(m.specialsUsed[0]).toBe(1);
    expect(fam(m, 'sophie').stats2.specials).toBe(1);
  });
  it('sin la barra llena o sin el balón no pasa nada', () => {
    const a = ready('sophie', 300); a.bar[0] = 99; press(a); expect(a.phase).toBe('play');
    const b = ready('sophie', 300); b.ball.owner = null; b.ball.state = 'free'; press(b); expect(b.phase).toBe('play');
  });
  it('Sophie lo lanza desde cualquier parte, los demás solo desde el 70 % de la cancha más cercano al arco rival', () => {
    expect(ready('sophie', 100).phase).toBe('play');
    const s = ready('sophie', 100); press(s); expect(s.phase).toBe('cinematic');
    const far = ready('papa', 200); press(far);
    expect(far.phase).toBe('play'); expect(far.bar[0]).toBe(100);
    expect(far.events.some((e) => e.k === 'special_far')).toBe(true);
    const near = ready('papa', PITCH.w - 672 + 10); press(near); expect(near.phase).toBe('cinematic');
  });
  it('el especial de cada uno tiene su nombre', () => {
    expect(['sophie', 'alana', 'papa', 'mama'].map((c) => specialKind(fam(mk(), c as 'sophie')))).toEqual(['arcoiris', 'burbuja', 'canonazo', 'estrellas']);
    expect(specialKind(fam(mk(), 'thor'))).toBe('carrera');
    expect(specialKind(rival(mk(), 3))).toBe('llamarada');
  });
  it('Thor con el balón en las manos: cualquier humano de la familia puede lanzar su Carrera Loca', () => {
    const m = createMatch({ ai: 'none', skipKickoff: true, humans: [seat(3)] }); for (const p of m.players) p.speedMult = 1;
    const thor = fam(m, 'thor'); clear(m, [thor]); put(thor, 14, 80); m.ball.state = 'held'; m.ball.owner = thor.id; m.bar[0] = 100;
    thor.state = 'hold'; step(m); press(m);
    expect(m.phase).toBe('cinematic'); expect(m.special!.kind).toBe('carrera'); expect(m.special!.shooter).toBe(thor.id);
  });
  it('B18: 1000 lanzamientos con probabilidad 0,70 dan 0,70 ± 0,04', () => {
    let goals = 0;
    for (let s = 1; s <= 1000; s++) {
      const m = ready('sophie', 500, { seed: s });
      expect(specialChance(m, fam(m, 'sophie'), { x: 500 })).toBeCloseTo(0.7, 5);
      launchSpecial(m, fam(m, 'sophie')); if (m.special!.outcome === 'goal') goals++;
    }
    expect(Math.abs(goals / 1000 - 0.7)).toBeLessThan(0.04);
  });
  it('B18: la misma semilla da el mismo resultado', () => {
    const run = (seed: number) => { const m = ready('mama', 800, { seed }); launchSpecial(m, fam(m, 'mama')); return m.special!.outcome; };
    for (const s of [1, 2, 3, 4, 5, 6]) expect(run(s)).toBe(run(s));
  });
  it('la probabilidad baja desde la mitad propia (no para Sophie), con el portero Campeón, y sube un poco con controles fáciles', () => {
    const m = ready('papa', 700); const papa = fam(m, 'papa');
    expect(specialChance(m, papa, { x: 700 })).toBeCloseTo(0.72, 5);
    expect(specialChance(m, papa, { x: 200 })).toBeCloseTo(0.72 * 0.85, 5);
    m.difficulty = 'campeones'; expect(specialChance(m, papa, { x: 700 })).toBeCloseTo(0.72 * 0.9, 5);
    m.difficulty = 'tranquilos'; expect(specialChance(m, papa, { x: 700 })).toBeCloseTo(0.72 * 1.15, 5);
    const e = ready('alana', 700, { controls: 'easy' }); expect(specialChance(e, fam(e, 'alana'), { x: 700 })).toBeCloseTo(0.75 + 0.1, 5);
    expect(specialChance(m, fam(m, 'sophie'), { x: 100 })).toBeCloseTo(0.7 * 1.15, 5);
    expect(specialChance(mk({ difficulty: 'campeones' }), rival(mk(), 3), { x: 100 })).toBeLessThanOrEqual(T.special.cap);
  });
});

describe('la cinemática es una fase de tiempo fijo', () => {
  const dur = (cine: 'full' | 'short' | 'off', n = 1): number => {
    const m = ready('sophie', 300, { cine }); let last = 0;
    for (let k = 0; k < n; k++) { m.phase = 'play'; m.restart = null; m.special = null; m.flight = null; ball(m, 300, 80); m.bar[0] = 100; give(m, fam(m, 'sophie')); step(m); press(m); const t0 = m.t; while ((m.phase as string) === 'cinematic') step(m); last = m.t - t0; secs(m, 0.5); }
    return last;
  };
  it('completa 3,5 s la primera vez y 2,0 s las siguientes; corta 2,0 s; sin cinemática 0,6 s', () => {
    expect(dur('full', 1)).toBeCloseTo(3.5, 1);
    expect(dur('full', 2)).toBeCloseTo(2.0, 1);
    expect(dur('short')).toBeCloseTo(2.0, 1);
    expect(dur('off')).toBeCloseTo(0.6, 1);
  });
  it('un toque la termina en el paso siguiente, pero no antes de 0,3 s', () => {
    const m = ready('sophie', 300); press(m);
    expect(m.phase).toBe('cinematic');
    setHumanInput(m, 0, inp({ shootPressed: true })); step(m); setHumanInput(m, 0, null);
    expect(m.phase).toBe('cinematic');   // 0.03 s: too early to skip
    secs(m, 0.3);
    setHumanInput(m, 0, inp({ passPressed: true })); step(m); setHumanInput(m, 0, null);
    expect(m.phase).not.toBe('cinematic');
  });
  it('durante la cinemática nada se mueve ni corre el reloj', () => {
    const m = ready('sophie', 300); const a = fam(m, 'sophie'), r = rival(m, 3); put(r, 600, 80); r.input = inp({ mx: -1 }); press(m);
    const x = r.x, clock = m.clock; secs(m, 1.0);
    expect(r.x).toBe(x); expect(m.clock).toBe(clock); expect(a.state).toBe('special');
  });
  it('si el resultado era gol, el gol se anota con el lanzador como goleador', () => {
    for (let s = 1; s <= 40; s++) {
      const m = ready('papa', 800, { seed: s, cine: 'off' }); press(m);
      if (m.special!.outcome !== 'goal') continue;
      while (m.phase === 'cinematic' || m.flight) step(m);
      expect(m.phase).toBe('goal'); expect(m.score[0]).toBe(1); expect(m.lastGoal!.scorer).toBe(fam(m, 'papa').id);
      return;
    }
    throw new Error('no goal in 40 seeds');
  });
  it('si era atajada el portero despeja y queda un rebote suelto cerca del área, nunca un balón en sus manos', () => {
    for (let s = 1; s <= 80; s++) {
      const m = ready('papa', 800, { seed: s, cine: 'off' }); press(m);
      if (m.special!.outcome !== 'save') continue;
      const gk = rival(m, 0); const saves = gk.stats2.saves;
      while (m.phase === 'cinematic' || m.flight) step(m);
      expect(m.phase).toBe('play'); expect(m.ball.state).toBe('free'); expect(m.ball.owner).toBeNull();
      expect(PITCH.w - m.ball.x).toBeLessThan(60); expect(PITCH.w - m.ball.x).toBeGreaterThan(20);
      expect(gk.stats2.saves).toBe(saves + 1);
      return;
    }
    throw new Error('no save in 80 seeds');
  });
  it('el Cañonazo tumba a los rivales que están en el camino (cuando no es gol, que si es gol todos celebran o se lamentan)', () => {
    for (let s = 1; s <= 40; s++) {
      const m = ready('papa', 600, { seed: s, cine: 'off' }); const r = rival(m, 3); put(r, 760, 80); press(m);
      if (m.special!.outcome !== 'save') continue;
      while (m.phase === 'cinematic' || m.flight) step(m);
      expect(r.state).toBe('tumble'); return;
    }
    throw new Error('no save in 40 seeds');
  });
  it('los rivales también lanzan especial (la IA lo decide) y a la familia no le pasa si hay un humano guardando la barra', () => {
    const m = createMatch({ ai: 'brain', skipKickoff: true, seed: 3, humans: [seat(3)] });
    m.bar[0] = 100; m.bar[1] = 100;
    let family = 0, rivals = 0;
    for (let i = 0; i < 60 * 40; i++) { step(m); for (const e of m.events) if (e.k === 'special') { if (m.special) { if (m.special.team === 0) family++; else rivals++; } } m.events = []; if (m.bar[1] < 100 && rivals) break; }
    expect(family).toBe(0); expect(rivals).toBeGreaterThan(0);
  });
});
describe('el vuelo guionado después de la cinemática', () => {
  const fl = (kind: SpecialKind, y1 = 90): Flight => ({ kind, team: 0, shooter: 1, keeper: null, outcome: 'goal', t: 0, dur: 1, x0: 600, y0: 70, x1: 968, y1, dived: false, targets: [], hit: [] });
  const KINDS: SpecialKind[] = ['arcoiris', 'burbuja', 'canonazo', 'estrellas', 'carrera', 'relampago', 'llamarada', 'ola', 'picada', 'hojas'];
  it('cada poder empieza donde está el balón y termina en el punto del resultado, bajo el travesaño', () => {
    for (const k of KINDS) {
      const a = flightPos(fl(k), 0), b = flightPos(fl(k), 1);
      expect([k, Math.round(a.x), Math.round(a.y)]).toEqual([k, 600, 70]);
      expect([k, Math.round(b.x), Math.round(b.y), b.z <= 16]).toEqual([k, 968, 90, true]);
    }
  });
  it('los poderes se distinguen: arco alto, burbuja baja y lenta, cañonazo recto a 600 px/s, picada fuera de pantalla', () => {
    const peak = (k: SpecialKind) => Math.max(...Array.from({ length: 21 }, (_, i) => flightPos(fl(k), i / 20).z));
    expect(peak('arcoiris')).toBeGreaterThan(55); expect(peak('burbuja')).toBeLessThan(24); expect(peak('canonazo')).toBeLessThan(16);
    expect(peak('llamarada')).toBeGreaterThan(90); expect(peak('picada')).toBeGreaterThan(300);
    expect(flightDur('canonazo', 600)).toBeCloseTo(1.0, 1); expect(flightDur('burbuja', 320)).toBeCloseTo(2.0, 1);
    const wiggle = (k: SpecialKind) => Math.max(...Array.from({ length: 41 }, (_, i) => Math.abs(flightPos(fl(k, 70), i / 40).y - 70)));
    expect(wiggle('canonazo')).toBeLessThan(1); expect(wiggle('estrellas')).toBeGreaterThan(20); expect(wiggle('relampago')).toBeGreaterThan(25);
  });
  it('el balón vuela guionado, el portero se estira hacia donde cae y el resultado llega al final', () => {
    for (let s = 1; s <= 60; s++) {
      const m = ready('papa', 800, { seed: s, cine: 'off' }); const gk = rival(m, 0); press(m);
      while (m.phase === 'cinematic') step(m);
      expect(m.flight).not.toBeNull(); expect(m.ball.state).toBe('scripted');
      const outcome = m.flight!.outcome; let dove = false, trails = 0, hadFlight = 0;
      while (m.flight) { step(m); hadFlight++; if (gk.state === 'dive') dove = true; trails += m.events.filter((e) => e.k === 'trail').length; m.events = []; }
      expect(hadFlight).toBeGreaterThan(20); expect(trails).toBeGreaterThan(20); expect(dove).toBe(true);
      expect(m.phase).toBe(outcome === 'goal' ? 'goal' : 'play');
      if (s >= 12) return;
    }
  });
  it('la Carrera Loca lleva a Thor con el balón hasta el arco rival y lo devuelve a su arco', () => {
    const m = createMatch({ ai: 'none', skipKickoff: true, humans: [seat(3)], cine: 'off', seed: 4 }); for (const p of m.players) p.speedMult = 1;
    const thor = fam(m, 'thor'); clear(m, [thor]); put(thor, 14, 80); m.ball.state = 'held'; m.ball.owner = thor.id; m.bar[0] = 100;
    thor.state = 'hold'; step(m); press(m);
    while (m.phase === 'cinematic') step(m);
    let far = 0; while (m.flight) { step(m); far = Math.max(far, thor.x); }
    expect(far).toBeGreaterThan(600); expect(thor.x).toBeLessThan(40); expect(thor.state).not.toBe('special');
  });
  it('si la partida termina en pleno vuelo no queda nada colgado', () => {
    const m = ready('sophie', 700, { cine: 'off' }); press(m); while (m.phase === 'cinematic') step(m);
    m.clock = m.halfLength - 0.01; for (let i = 0; i < 400 && m.phase !== 'halftime'; i++) step(m);
    step(m); step(m);
    expect(m.flight).toBeNull(); expect(fam(m, 'sophie').state).not.toBe('special');
  });
});
void updateBar; void ticks;
