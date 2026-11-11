import { describe, expect, it } from 'vitest';
import { createMatch, step } from '../../src/core/match';
import { setHumanInput } from '../../src/core/control';
import { furyOn, knockDown } from '../../src/core/actions';
import { specialKind } from '../../src/core/specials';
import { MID, PITCH } from '../../src/core/field';
import { T } from '../../src/core/tuning';
import type { Match, Player } from '../../src/core/state';
import { ball, clear, give, inp, mk, put } from './helpers';

/** A person moves Sophie (full controls), alone in the middle. */
function solo(controls: 'full' | 'easy' = 'full'): { m: Match; me: Player } {
  const m = createMatch({ ai: 'none', skipKickoff: true, seed: 4, humans: [{ team: 0, slot: 4, humanSlot: 0, controls }] });
  for (const p of m.players) p.speedMult = 1;
  clear(m);
  const me = m.players.find((p) => p.id === m.humans[0].id)!;
  put(me, 600, MID); me.facing = 1; me.dirX = 1; me.dirY = 0;
  return { m, me };
}
const tick = (m: Match, f = inp()): void => { setHumanInput(m, 0, f); step(m); };
const foe = (m: Match): Player => m.players.find((p) => p.team === 1 && p.role === 'fwd')!;

describe('machacar para levantarse', () => {
  const downFor = (mash: boolean): number => {
    const { m, me } = solo(); ball(m, me.x + 4, me.y);   // the ball stays by him, so the person keeps moving him
    for (const q of m.players) q.noControlT = 99;
    knockDown(m, me, null, 0, 0, 120);
    let n = 0;
    while (me.state === 'tumble' && n < 400) { tick(m, mash && n % 6 === 0 ? inp({ shoot: true, shootPressed: true }) : inp()); n++; }
    return n / 60;
  };
  it('apretando botones se levanta mucho antes, pero nunca antes de terminar de caer', () => {
    const still = downFor(false), mashed = downFor(true);
    expect(still).toBeGreaterThan(1.5);
    expect(mashed).toBeLessThan(still - 0.5); expect(mashed).toBeGreaterThanOrEqual(T.mash.min - 0.02);
  });
  it('a los que mueve la IA no los levanta nadie antes de tiempo', () => {
    const { m } = solo(); const o = foe(m); put(o, 300, MID); knockDown(m, o, null, 0, 0, 120);
    let n = 0; while (o.state === 'tumble' && n < 400) { tick(m, inp({ shoot: true, shootPressed: n % 4 === 0 })); n++; }
    expect(n / 60).toBeGreaterThan(1.5);
  });
});

describe('burlarse del caído', () => {
  it('Tiro junto a un rival tumbado es una risa: carga la barra una sola vez por caída y no es una barrida', () => {
    const { m, me } = solo(); ball(m, 100, 20);
    const o = foe(m); put(o, me.x + 16, me.y + 4); knockDown(m, o, null, 0, 0, 60, 2.2);   // down for a good while
    for (let i = 0; i < 50; i++) tick(m);
    expect(o.state).toBe('tumble'); expect(o.z).toBe(0);
    const bar = m.bar[0];
    tick(m, inp({ shoot: true, shootPressed: true }));
    expect(me.act?.kind).toBe('taunt'); expect(me.state).toBe('bump');
    expect(m.events.some((e) => e.k === 'taunt' && e.who === me.id)).toBe(true);
    expect(m.bar[0]).toBeCloseTo(bar + T.taunt.bar, 1);
    for (let i = 0; i < 60; i++) tick(m);
    expect(me.act).toBeNull();
    const bar2 = m.bar[0];
    tick(m, inp({ shoot: true, shootPressed: true }));
    expect(me.act?.kind).toBe('taunt'); expect(m.bar[0] - bar2).toBeLessThan(0.2);   // the same fall: no more bar (only the slow charge of the half)
  });
  it('sin nadie tumbado al lado, Tiro sigue siendo la barrida', () => {
    const { m, me } = solo(); ball(m, 100, 20);
    tick(m, inp({ shoot: true, shootPressed: true }));
    expect(me.act?.kind).toBe('slide');
  });
});

describe('remate combinado', () => {
  /** A mate lobbed it to Sophie and it is over her now, in reach of her head, `dGoal` px from the goal. */
  const cross = (fromMate: boolean, dGoal = 150) => {
    const { m, me } = solo(); put(me, PITCH.w - dGoal, MID);
    const mate = m.players.find((p) => p.team === 0 && p.role === 'mid')!, o = foe(m);
    ball(m, me.x + 3, me.y, 34, 0, 0, -30);
    m.ball.lastTouch = { team: fromMate ? 0 : 1, player: fromMate ? mate.id : o.id, t: m.t };
    m.lastPass = fromMate ? { from: mate.id, to: me.id, t: m.t, team: 0 } : null;
    return { m, me };
  };
  it('un centro de un compañero rematado en el aire es el poder de quien remata', () => {
    const { m, me } = cross(true);
    tick(m, inp({ shoot: true, shootPressed: true }));
    expect(me.state).toBe('kick');
    let combo = false;
    for (let i = 0; i < 40 && !m.flight; i++) { tick(m); if (m.events.some((e) => e.k === 'combo' && e.who === me.id)) combo = true; }
    expect(combo).toBe(true); expect(m.flight).not.toBeNull();
    expect(m.flight!.kind).toBe(specialKind(me)); expect(m.flight!.shooter).toBe(me.id); expect(me.state).toBe('special');
  });
  it('si el balón no viene de un compañero también es remate de poder, pero sin el premio del combinado; lejos del arco es un cabezazo normal', () => {
    const a = cross(false); let combo = false;
    tick(a.m, inp({ shoot: true, shootPressed: true }));
    for (let i = 0; i < 40 && !a.m.flight; i++) { tick(a.m); if (a.m.events.some((e) => e.k === 'combo')) combo = true; }
    expect(a.m.flight).not.toBeNull(); expect(combo).toBe(false); expect(a.me.supAnim).toBe('header');
    const b = cross(true, T.airPower.range + 80);
    tick(b.m, inp({ shoot: true, shootPressed: true }));
    for (let i = 0; i < 40; i++) tick(b.m);
    expect(b.m.flight).toBeNull(); expect(b.m.ball.kick?.kind).toBe('header');
  });
});

describe('sangre caliente', () => {
  /** The rivals score: the ball is in the net of the family. */
  const concede = (m: Match, team: 0 | 1 = 1): void => {
    while (m.phase !== 'play') step(m);
    const s = m.players.find((p) => p.team === team && p.role === 'fwd')!;
    Object.assign(m.ball, { state: 'free', owner: null, x: team === 1 ? -4 : PITCH.w + 4, y: MID, z: 5, vx: 0, vy: 0, vz: 0, inNet: true, scored: team });
    m.ball.lastTouch = { team, player: s.id, t: m.t };
    m.events = []; step(m);
  };
  it('el equipo que queda dos abajo se enciende un rato: corre más, y después se le pasa', () => {
    const m = mk({ ai: 'none' });
    concede(m); expect(furyOn(m, 0)).toBe(false);
    concede(m); expect(m.score).toEqual([0, 2]);
    expect(furyOn(m, 0)).toBe(true); expect(furyOn(m, 1)).toBe(false);
    expect(m.events.some((e) => e.k === 'fury' && e.v === 0)).toBe(true);
    while (m.phase !== 'play') step(m);
    const top = (p: Player): number => { let v = 0; for (let i = 0; i < 90; i++) { p.input = inp({ mx: p.team === 0 ? 1 : -1 }); step(m); v = Math.max(v, Math.abs(p.vx)); } return v / p.stats.run; };
    const a = m.players.find((p) => p.team === 0 && p.role === 'def')!, b = m.players.find((p) => p.team === 1 && p.role === 'def')!;
    expect(top(a)).toBeGreaterThan(top(b) * (T.fury.speed - 0.03));
    for (let i = 0; i < (T.fury.dur + T.goalT + 2) * 60 && furyOn(m, 0); i++) step(m);
    expect(furyOn(m, 0)).toBe(false);
  });
  it('los rivales también se encienden cuando van dos abajo, menos en Tranquilos', () => {
    const hot = (difficulty: 'tranquilos' | 'normales'): boolean => { const m = mk({ ai: 'none', difficulty }); concede(m, 0); concede(m, 0); return furyOn(m, 1); };
    expect(hot('normales')).toBe(true); expect(hot('tranquilos')).toBe(false);
  });
});
