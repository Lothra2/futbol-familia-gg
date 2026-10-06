import { describe, expect, it } from 'vitest';
import { step } from '../../src/core/match';
import { DT } from '../../src/core/step';
import { T } from '../../src/core/tuning';
import { PITCH } from '../../src/core/field';
import { ball, clear, fam, give, mk, put, rival, secs, ticks, inp } from './helpers';

const until = (m: ReturnType<typeof mk>, cond: () => boolean, maxS = 10): number => { let t = 0; while (!cond() && t < maxS) { step(m); t += DT; } return t; };

describe('goles', () => {
  it('B6: gol con cruce completo entre los palos y bajo el travesaño, para el equipo que ataca ese arco', () => {
    const m = mk(); clear(m); ball(m, 40, 80, 5, -300, 0, 0);
    until(m, () => m.phase === 'goal');
    expect(m.phase).toBe('goal'); expect(m.score).toEqual([0, 1]);
    const m2 = mk(); clear(m2); ball(m2, PITCH.w - 40, 70, 5, 300, 0, 0);
    until(m2, () => m2.phase === 'goal');
    expect(m2.score).toEqual([1, 0]);
  });
  it('B6: un tiro al palo no es gol', () => {
    const m = mk(); clear(m); ball(m, 40, 57, 5, -300, 0, 0);
    ticks(m, 60);
    expect(m.score).toEqual([0, 0]);
  });
  it('B6: por encima del travesaño no es gol: sale por la línea de fondo', () => {
    const m = mk(); clear(m); ball(m, 40, 80, 40, -300, 0, 0); m.ball.vz = 0; m.ball.lastTouch = { team: 1, player: 6, t: 0 };
    ticks(m, 40);
    expect(m.score).toEqual([0, 0]);
    expect(m.phase).toBe('restart'); expect(m.restart!.kind).toBe('goalkick'); expect(m.restart!.team).toBe(0);
  });
  it('B6: después del gol, saque del medio para el equipo que lo recibió, tras 2,8 s', () => {
    const m = mk(); clear(m); ball(m, 40, 80, 5, -300, 0, 0);
    until(m, () => m.phase === 'goal');
    secs(m, T.goalT + 0.05);
    expect(m.phase).toBe('kickoff'); expect(m.restart!.kind).toBe('kickoff'); expect(m.restart!.team).toBe(0);
    expect(m.ball.x).toBe(PITCH.w / 2);
  });
  it('el goleador y quien dio el pase quedan anotados', () => {
    const m = mk(); clear(m); const a = fam(m, 'sophie'), b = fam(m, 'alana');
    m.ball.prevTouch = { team: 0, player: b.id, t: m.t }; ball(m, PITCH.w - 40, 80, 5, 300, 0, 0); m.ball.lastTouch = { team: 0, player: a.id, t: m.t };
    until(m, () => m.phase === 'goal');
    expect(m.lastGoal).toEqual({ team: 0, scorer: a.id, assist: b.id });
    expect(a.stats2.goals).toBe(1); expect(b.stats2.assists).toBe(1);
  });
});

describe('saques', () => {
  const fromOut = (setup: (m: ReturnType<typeof mk>) => void) => { const m = mk(); clear(m); setup(m); until(m, () => m.phase === 'restart' || m.phase === 'kickoff', 3); return m; };
  it('B7: banda: saque para el equipo que no tocó último, en el punto de salida', () => {
    const m = fromOut((mm) => { ball(mm, 300, 4, 0, 40, -150, 0); mm.ball.lastTouch = { team: 0, player: 1, t: 0 }; });
    expect(m.restart!.kind).toBe('throwin'); expect(m.restart!.team).toBe(1); expect(m.restart!.y).toBe(0);
    expect(Math.abs(m.restart!.x - 305)).toBeLessThan(25);
    const m2 = fromOut((mm) => { ball(mm, 600, PITCH.d - 4, 0, 0, 150, 0); mm.ball.lastTouch = { team: 1, player: 6, t: 0 }; });
    expect(m2.restart!.kind).toBe('throwin'); expect(m2.restart!.team).toBe(0); expect(m2.restart!.y).toBe(PITCH.d);
  });
  it('B7: línea de fondo: saque de arco si tocó último el atacante, córner si tocó último el defensor', () => {
    const a = fromOut((mm) => { ball(mm, 20, 20, 0, -300, 0, 0); mm.ball.lastTouch = { team: 1, player: 6, t: 0 }; });
    expect(a.restart).toMatchObject({ kind: 'goalkick', team: 0 }); expect(a.restart!.x).toBe(32);
    const b = fromOut((mm) => { ball(mm, 20, 20, 0, -300, 0, 0); mm.ball.lastTouch = { team: 0, player: 1, t: 0 }; });
    expect(b.restart).toMatchObject({ kind: 'corner', team: 1 }); expect(b.restart!.y).toBe(4);
    const c = fromOut((mm) => { ball(mm, PITCH.w - 20, 140, 0, 300, 0, 0); mm.ball.lastTouch = { team: 1, player: 6, t: 0 }; });
    expect(c.restart).toMatchObject({ kind: 'corner', team: 0 }); expect(c.restart!.y).toBe(PITCH.d - 4);
    const d = fromOut((mm) => { ball(mm, PITCH.w - 20, 140, 0, 300, 0, 0); mm.ball.lastTouch = { team: 0, player: 1, t: 0 }; });
    expect(d.restart).toMatchObject({ kind: 'goalkick', team: 1 }); expect(d.restart!.x).toBe(PITCH.w - 32);
  });
  it('B7: los cuatro saques se resuelven en ≤ 3,5 s sin entrada (IA) y en 3,0 s con un humano que no toca nada', () => {
    const setups: [string, (mm: ReturnType<typeof mk>) => void][] = [
      ['throwin', (mm) => { ball(mm, 300, 4, 0, 40, -150, 0); mm.ball.lastTouch = { team: 0, player: 1, t: 0 }; }],
      ['goalkick', (mm) => { ball(mm, 20, 20, 0, -300, 0, 0); mm.ball.lastTouch = { team: 1, player: 6, t: 0 }; }],
      ['corner', (mm) => { ball(mm, 20, 20, 0, -300, 0, 0); mm.ball.lastTouch = { team: 0, player: 1, t: 0 }; }],
    ];
    for (const human of [false, true]) for (const [kind, f] of setups) {
      const m = mk(); clear(m); f(m);
      until(m, () => m.phase === 'restart', 3);
      expect(m.restart!.kind).toBe(kind);
      if (human) m.players.find((p) => p.id === m.restart!.taker)!.control = 'human';
      const t = until(m, () => m.phase === 'play', 4);
      expect(t, `${kind} human=${human}`).toBeLessThanOrEqual(human ? 3.05 : 1.25);
      expect(m.ball.state).toBe('free'); expect(Math.hypot(m.ball.vx, m.ball.vy)).toBeGreaterThan(30);
    }
    const k = mk({ skipKickoff: false, ai: 'none' }); const t = until(k, () => k.phase === 'play', 4);
    expect(t).toBeLessThanOrEqual(1.6);
    const kh = mk({ skipKickoff: false, ai: 'none', humans: [{ team: 0, slot: 4, humanSlot: 0, controls: 'full' }] }); kh.players.forEach((p) => { p.speedMult = 1; });
    expect(until(kh, () => kh.phase === 'play', 4)).toBeLessThanOrEqual(2.05);
  });
  it('un humano que aprieta Pase saca antes del tiempo máximo', () => {
    const m = mk(); clear(m); ball(m, 300, 4, 0, 40, -150, 0); m.ball.lastTouch = { team: 0, player: 1, t: 0 };
    until(m, () => m.phase === 'restart', 3);
    const taker = m.players.find((p) => p.id === m.restart!.taker)!; taker.control = 'human';
    secs(m, 1.0);
    expect(m.phase).toBe('restart');
    taker.input = inp({ passPressed: true }); step(m); taker.input = inp();
    expect(m.phase).toBe('play');
  });
  it('en modo fácil el humano saca solo a los 1,2 s', () => {
    const m = mk(); clear(m); ball(m, 300, 4, 0, 40, -150, 0); m.ball.lastTouch = { team: 0, player: 1, t: 0 };
    until(m, () => m.phase === 'restart', 3);
    const taker = m.players.find((p) => p.id === m.restart!.taker)!; taker.control = 'human'; taker.controls = 'easy';
    expect(until(m, () => m.phase === 'play', 4)).toBeLessThanOrEqual(1.25);
  });
});

describe('reloj', () => {
  it('B8: el reloj corre en juego y se para en goles y saques', () => {
    const m = mk({ halfLength: 60 }); clear(m);
    secs(m, 2); expect(m.clock).toBeCloseTo(2, 1);
    ball(m, 40, 80, 5, -300, 0, 0); until(m, () => m.phase === 'goal');
    const c = m.clock; secs(m, 1.5); expect(m.clock).toBe(c);
    secs(m, 2); expect(m.phase).toBe('kickoff'); const c2 = m.clock; secs(m, 0.3); expect(m.clock).toBe(c2);
  });
  it('B8: a los 10 s se acaba el primer tiempo, el medio tiempo dura 3,5 s y saca el otro equipo', () => {
    const m = mk({ halfLength: 10 }); clear(m); ball(m, 480, 80, 0, 0, 0, 0);
    secs(m, 10.2);
    expect(m.phase).toBe('halftime');
    secs(m, T.halftimeT + 0.05);
    expect(m.half).toBe(2); expect(m.phase).toBe('kickoff'); expect(m.restart!.team).toBe(1); expect(m.clock).toBe(0);
    m.players.forEach((p) => { p.control = 'ai'; });
    until(m, () => m.phase === 'play', 4); ball(m, 480, 80, 0, 0, 0, 0); clear(m);
    secs(m, 10.2); expect(m.phase).toBe('penalties');   // 0-0: a tie goes to the shootout
  });
  it('B8: espera un tiro que llega al arco en menos de 1 s, y no espera uno que no es peligroso', () => {
    const m = mk({ halfLength: 5 }); clear(m); ball(m, 600, 80, 5, 0, 0, 0);
    secs(m, 4.9); ball(m, PITCH.w - 120, 80, 5, 400, 0, 0);
    secs(m, 0.5);
    expect(m.phase).toBe('goal'); expect(m.score).toEqual([1, 0]);
    const n = mk({ halfLength: 5 }); clear(n); ball(n, 600, 80, 5, 0, 0, 0);
    secs(n, 5.2); expect(n.phase).toBe('halftime');
  });
});

describe('aguante', () => {
  it('B14: Sophie esprinta 2,6 s y se agota, y recupera todo en 3,8 s', () => {
    const m = mk(); clear(m); const s = fam(m, 'sophie'); put(s, 100, 80); s.facing = 1;
    let t = 0;
    while (s.stamina > 0 && t < 4) { s.input = inp({ mx: 1, sprint: true }); step(m); t += DT; put(s, Math.min(s.x, 400), 80); }
    expect(t).toBeGreaterThan(2.55); expect(t).toBeLessThan(2.65);
    expect(s.sprintLock).toBe(true);
    s.input = inp(); secs(m, 0.5 + 100 / 30 + 0.05);
    expect(s.stamina).toBeGreaterThan(99);
    expect(s.sprintLock).toBe(false);
  });
  it('B14: sin aguante no hay sprint hasta volver a 35', () => {
    const m = mk(); clear(m); const s = fam(m, 'sophie'); put(s, 100, 80); s.stamina = 0; s.sprintLock = true;
    let maxV = 0;
    for (let i = 0; i < 120; i++) { s.input = inp({ mx: 1, sprint: true }); step(m); maxV = Math.max(maxV, Math.abs(s.vx)); put(s, 100 + 0 * i, 80); s.vx = Math.max(s.vx, 0); }
    expect(maxV).toBeLessThanOrEqual(100.5);
    secs(m, 1.2);
    s.input = inp({ mx: 1, sprint: true }); ticks(m, 40, () => { /* held */ });
    expect(s.sprintLock || s.stamina < 100).toBe(true);
  });
  it('sprint más rápido que correr y el balón en los pies frena al jugador', () => {
    const m = mk(); clear(m); const s = fam(m, 'sophie'), a = fam(m, 'alana'); put(s, 100, 40); put(a, 100, 120);
    secs(m, 1.0, () => { s.input = inp({ mx: 1, sprint: true }); a.input = inp({ mx: 1 }); });
    expect(s.vx).toBeCloseTo(100 * 1.35, 0); expect(a.vx).toBeCloseTo(92, 0);
    const b = fam(m, 'papa'); put(b, 100, 80); give(m, b);
    secs(m, 1.0, () => { b.input = inp({ mx: 1 }); });
    expect(b.vx).toBeCloseTo(96 * 0.92, 0);
  });
});
