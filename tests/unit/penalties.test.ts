import { describe, expect, it } from 'vitest';
import { createMatch, step } from '../../src/core/match';
import { setHumanInput } from '../../src/core/control';
import { decided, spot, startPenalties, tally } from '../../src/core/penalties';
import { T } from '../../src/core/tuning';
import { goalX } from '../../src/core/field';
import { inp, secs } from './helpers';
import type { Match, Pen } from '../../src/core/state';

const pen = (a: (0 | 1)[], b: (0 | 1)[], turn: 0 | 1 = 0): Pen => ({ turn, first: 0, kicks: [a, b], round: 0, step: 'ready', t: 0, aimY: 80, aim: { zone: 1, y: 80 }, shooter: 0, keeper: 0, outcome: null, shotY: 80, diveY: 80, winner: null, seed: 0 });
function shootout(seed: number, difficulty: 'tranquilos' | 'normales' | 'campeones' = 'normales'): { m: Match; kicks: number; sudden: boolean; steps: number } {
  const m = createMatch({ seed, ai: 'none', difficulty, knockout: true, skipKickoff: true, firstKick: (seed % 2) as 0 | 1 });
  startPenalties(m);
  let n = 0;
  while (m.phase === 'penalties' && n < 60 * 600) { step(m); n++; m.events = []; }
  const t = tally(m.pen!);
  return { m, kicks: t.taken[0] + t.taken[1], sudden: t.taken[0] > 3, steps: n };
}

describe('penales y gol de oro (B25)', () => {
  it('decide después de 3 tiros cada uno cuando el otro ya no puede alcanzarlo, y después por rondas de a dos', () => {
    expect(decided(pen([1, 1, 1], [0, 0, 0]))).toBe(0);
    expect(decided(pen([1, 1], [0, 0]))).toBe(0);          // 2 against 0 with 1 kick left each: the rival can reach 1 at most
    expect(decided(pen([1], [0]))).toBeNull();
    expect(decided(pen([1, 1, 0], [1, 1, 0]))).toBeNull();   // 2 to 2 after three each
    expect(decided(pen([1, 1, 0, 1], [1, 1, 0]))).toBeNull(); // sudden death: the second team has not kicked yet
    expect(decided(pen([1, 1, 0, 1], [1, 1, 0, 0]))).toBe(0);
    expect(decided(pen([1, 1, 0, 0], [1, 1, 0, 1]))).toBe(1);
    expect(decided(pen([0, 1, 1], [1, 1, 1]))).toBe(1);
  });
  it('200 tandas terminan con un ganador, con muerte súbita incluida', () => {
    let sudden = 0, long = 0;
    for (let s = 1; s <= 200; s++) {
      const r = shootout(s, (['tranquilos', 'normales', 'campeones'] as const)[s % 3]);
      expect(r.m.phase, `semilla ${s}`).toBe('over'); expect(r.m.penWinner, `semilla ${s}`).not.toBeNull();
      const t = tally(r.m.pen!); expect(t.goals[r.m.penWinner!], `semilla ${s}`).toBeGreaterThan(t.goals[r.m.penWinner! === 0 ? 1 : 0]);
      expect(r.kicks).toBeGreaterThanOrEqual(4); expect(r.kicks).toBeLessThan(40);
      if (r.sudden) sudden++; if (r.kicks > 10) long++;
    }
    expect(sudden).toBeGreaterThan(10); void long;      // some of the 200 go to sudden death
  });
  it('el balón y los jugadores se colocan en el punto de penal del arco que corresponde', () => {
    const m = createMatch({ seed: 3, ai: 'none', knockout: true, skipKickoff: true, firstKick: 1 });
    startPenalties(m);
    const p = m.pen!, sh = m.players.find((q) => q.id === p.shooter)!, gk = m.players.find((q) => q.id === p.keeper)!;
    expect(p.turn).toBe(0); expect(m.ball.x).toBe(spot(0).x); expect(m.ball.y).toBe(80);
    expect(sh.team).toBe(0); expect(gk.team).toBe(1); expect(gk.role).toBe('gk'); expect(Math.abs(gk.x - goalX(0))).toBeLessThan(8);
  });
  it('un humano apunta con el joystick y patea con Tiro: el tiro va donde apuntó', () => {
    const goals = (aim: number): number => {
      let g = 0;
      for (let s = 1; s <= 30; s++) {
        const m = createMatch({ seed: s, ai: 'none', knockout: true, skipKickoff: true, firstKick: 1, humans: [{ team: 0, slot: 3, humanSlot: 0, controls: 'full' }] });
        startPenalties(m);
        while (m.pen!.step !== 'aim') step(m);
        for (let i = 0; i < 40; i++) { setHumanInput(m, 0, inp({ my: aim })); step(m); }
        const aimY = m.pen!.aimY;
        setHumanInput(m, 0, inp({ shootPressed: true })); step(m); setHumanInput(m, 0, null);
        expect(m.pen!.step).toBe('fly'); expect(Math.abs(m.pen!.shotY - aimY)).toBeLessThan(8);
        if (aim > 0) expect(aimY).toBeGreaterThan(80); else expect(aimY).toBeLessThan(80);
        while ((m.pen!.step as string) === 'fly') step(m);
        if (m.pen!.outcome === 'goal') g++;
      }
      return g;
    };
    expect(goals(0.55)).toBeGreaterThan(5); expect(goals(-0.55)).toBeGreaterThan(5);
  });
  it('un humano que no hace nada patea solo a los 4 s', () => {
    const m = createMatch({ seed: 4, ai: 'none', knockout: true, skipKickoff: true, firstKick: 1, humans: [{ team: 0, slot: 3, humanSlot: 0, controls: 'easy' }] });
    startPenalties(m); secs(m, 1.2); expect(m.pen!.step).toBe('aim');
    secs(m, 4.0); expect(m.pen!.step).toBe('fly');
  });
  it('en un partido de Copa, el empate al final pasa al gol de oro: el primer gol termina el partido', () => {
    const m = createMatch({ seed: 5, ai: 'brain', knockout: true, skipKickoff: true, halfLength: 5 });
    m.half = 2; m.clock = 4.99; m.score = [1, 1];
    for (let i = 0; i < 60 * 3 && !m.golden; i++) step(m);
    expect(m.golden).toBe(true); expect(m.halfLength).toBe(T.goldenT); expect(m.clock).toBeLessThan(1);
    for (let i = 0; i < 60 * 5; i++) step(m);                 // play on until the kickoff is over
    m.phase = 'play'; m.restart = null; m.ball.state = 'free';
    Object.assign(m.ball, { x: 968, y: 80, z: 6, vx: 0, vy: 0, vz: 0, inNet: true, scored: 0 }); step(m);
    expect(m.phase).toBe('goal'); secs(m, T.goalT + 0.2);
    expect(m.phase).toBe('over'); expect(m.score).toEqual([2, 1]); expect(m.penWinner).toBeNull();
  });
  it('si nadie marca en los 60 s de oro van a penales, y un partido que no es de Copa nunca los juega', () => {
    const m = createMatch({ seed: 6, ai: 'none', knockout: true, skipKickoff: true, halfLength: 5 });
    m.half = 2; m.clock = 4.99; m.score = [0, 0];
    for (let i = 0; i < 60 * 3 && !m.golden; i++) step(m);
    m.clock = T.goldenT - 0.01; (m as any).phase = 'play'; m.restart = null; m.ball.state = 'free';
    for (let i = 0; i < 60 * 3 && (m.phase as string) !== 'penalties'; i++) step(m);
    expect(m.phase as string).toBe('penalties');
    const q = createMatch({ seed: 6, ai: 'none', skipKickoff: true, halfLength: 5 });
    q.half = 2; q.clock = 4.99; q.score = [0, 0]; for (let i = 0; i < 60 * 3 && q.phase !== 'over'; i++) step(q);
    expect(q.phase).toBe('over'); expect(q.golden).toBe(false);
  });
});
