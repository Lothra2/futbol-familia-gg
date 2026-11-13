import { describe, expect, it } from 'vitest';
import { createMatch, step } from '../../src/core/match';
import { setHumanInput } from '../../src/core/control';
import { CELE } from '../../src/core/celebrate';
import { ESCAPE, PITCH } from '../../src/core/field';
import { T } from '../../src/core/tuning';
import type { Match, Player } from '../../src/core/state';
import { clear, inp, put, rival } from './helpers';

/** A person plays (slot 4, full or easy controls) and her player has just scored. */
function goal(controls: 'full' | 'easy' = 'full', team: 0 | 1 = 0): { m: Match; me: Player } {
  const m = createMatch({ ai: 'none', skipKickoff: true, seed: 2, humans: [{ team: 0, slot: 4, humanSlot: 0, controls }] });
  for (const p of m.players) p.speedMult = 1; clear(m);
  const me = m.players.find((p) => p.id === m.humans[0].id)!; put(me, 860, 200);
  const sc = team === 0 ? me : rival(m, 3);
  Object.assign(m.ball, { state: 'free', owner: null, x: team === 0 ? PITCH.w + 4 : -4, y: 200, z: 5, vx: 0, vy: 0, vz: 0, inNet: true, scored: team });
  m.ball.lastTouch = { team, player: sc.id, t: m.t };
  step(m);
  return { m, me };
}
const tick = (m: Match, f = inp(), n = 1): void => { for (let i = 0; i < n; i++) { setHumanInput(m, 0, i === 0 ? f : inp({ mx: f.mx, my: f.my })); step(m); } };
const gestures = (m: Match): number[] => m.events.filter((e) => e.k === 'celemove' && (e.v ?? 0) >= 10).map((e) => e.v!);

describe('la celebración se juega (Nekketsu Soccer League)', () => {
  it('sin tocar nada sale la celebración de siempre y dura lo de siempre', () => {
    const { m, me } = goal();
    let n = 0; while (m.phase === 'goal' && n < 600) { tick(m); n++; }
    expect(me.cele?.free ?? false).toBe(false); expect(n / 60).toBeCloseTo(T.goalT, 1);
  });
  it('el stick lo pasea orgulloso por donde ella quiera, más lento que corriendo', () => {
    const { m, me } = goal(); tick(m, inp(), 40);
    const x0 = me.x, y0 = me.y;
    tick(m, inp({ mx: -1 }), 60);
    expect(me.cele?.free).toBe(true); expect(me.cele?.move).toBe('prance');
    expect(x0 - me.x).toBeGreaterThan(CELE.prance * 0.8); expect(x0 - me.x).toBeLessThan(CELE.prance * 1.25); expect(Math.abs(me.y - y0)).toBeLessThan(3);
    tick(m, inp({ my: 1 }), 30); expect(me.y).toBeGreaterThan(y0 + 20);
  });
  it('cada botón es un gesto: Tiro salta con el puño, Pase saluda, Especial posa a la cámara, Salto da la voltereta', () => {
    const { m, me } = goal(); tick(m, inp(), 15); m.events = [];
    tick(m, inp({ shootPressed: true, shoot: true })); expect(me.cele?.move).toBe('pump'); expect(me.z).toBeGreaterThan(0);
    const pumpTop = (() => { let t = 0; while (me.z > 0) { tick(m); t = Math.max(t, me.z); } return t; })();
    tick(m, inp({ passPressed: true, pass: true })); expect(me.cele?.move).toBe('wave'); expect(me.z).toBe(0);
    tick(m, inp({ mx: 1 }), 20); expect(Math.hypot(me.vx, me.vy)).toBeLessThan(1);   // he stands while he waves
    tick(m, inp(), Math.round(CELE.waveT * 60));
    tick(m, inp({ specialPressed: true, special: true })); expect(me.cele?.move).toBe('burla'); expect(me.dirY).toBe(1);   // looking at the camera
    tick(m, inp(), Math.round(CELE.burlaT * 60));
    tick(m, inp({ jumpPressed: true, jump: true })); expect(me.cele?.move).toBe('flip');
    let flipTop = 0; while (me.z > 0) { tick(m); flipTop = Math.max(flipTop, me.z); }
    expect(flipTop).toBeGreaterThan(pumpTop + 8);
    // every gesture was announced once, and the first time of each counts as new (20 +)
    expect(gestures(m)).toEqual([20, 21, 23, 22]);
    tick(m, inp({ shootPressed: true, shoot: true })); expect(gestures(m).at(-1)).toBe(10);   // a second fist is not new
  });
  it('Tiro y Pase a la vez también dan la voltereta, y en el aire no se encadenan gestos', () => {
    const { m, me } = goal(); tick(m, inp(), 15); m.events = [];
    tick(m, inp({ shootPressed: true, passPressed: true })); expect(me.cele?.move).toBe('flip');
    tick(m, inp({ passPressed: true })); expect(me.cele?.move).toBe('flip'); expect(gestures(m).length).toBe(1);
    // the button pressed in the air waits for the landing
    while (me.z > 0) tick(m);
    tick(m); expect(me.cele?.move).toBe('wave'); expect(gestures(m).length).toBe(2);
  });
  it('mientras ella siga celebrando la fiesta sigue, hasta un máximo; si para, el partido continúa', () => {
    const a = goal(); let n = 0;
    while (a.m.phase === 'goal' && n < 900) { tick(a.m, inp({ shootPressed: n % 30 === 0, shoot: n % 30 === 0 })); n++; }
    expect(n / 60).toBeGreaterThan(CELE.max - 0.1); expect(n / 60).toBeLessThan(CELE.max + 0.1);
    const b = goal(); n = 0;
    while (b.m.phase === 'goal' && n < 900) { tick(b.m, inp({ shootPressed: n === 150, shoot: n === 150 })); n++; }   // one last gesture at 2.5 s
    expect(n / 60).toBeGreaterThan(2.5 + CELE.hold - 0.1); expect(n / 60).toBeLessThan(2.5 + CELE.hold + 0.5);   // (the press waits for him to land)
  });
  it('sus botones no cortan su propia fiesta, pero "seguir" sí; si el gol fue del rival cualquier botón sigue', () => {
    const a = goal(); tick(a.m, inp(), Math.round(T.goalSkip * 60) + 2);
    tick(a.m, inp({ shootPressed: true })); tick(a.m, inp({ passPressed: true })); expect(a.m.phase).toBe('goal');
    a.m.data.skipGoal = true; tick(a.m); expect(a.m.phase).not.toBe('goal');
    const b = goal('full', 1); tick(b.m, inp(), Math.round(T.goalSkip * 60) + 2); expect(b.m.phase).toBe('goal');
    tick(b.m, inp({ shootPressed: true })); expect(b.m.phase).not.toBe('goal');
  });
  it('con controles fáciles también: Tiro salta y Especial posa', () => {
    const { m, me } = goal('easy'); tick(m, inp(), 15);
    tick(m, inp({ shootPressed: true, shoot: true })); expect(me.cele?.move).toBe('pump');
    while (me.z > 0) tick(m);
    tick(m, inp({ specialPressed: true })); expect(me.cele?.move).toBe('burla');
  });
  it('si la dejan sola no se queda parada: vuelve a saltar con el puño; y nunca sale de la cancha ni da NaN', () => {
    const { m, me } = goal(); tick(m, inp(), 15);
    tick(m, inp({ passPressed: true })); tick(m, inp(), Math.round((CELE.waveT + CELE.lazy) * 60) + 20);
    expect(me.cele?.move).toBe('pump');
    const c = goal(); tick(c.m, inp(), 40); tick(c.m, inp({ mx: 1, my: -1 }), 240);
    for (const p of c.m.players) { expect(Number.isFinite(p.x + p.y + p.z)).toBe(true); expect(p.x).toBeLessThanOrEqual(ESCAPE.x1); expect(p.y).toBeGreaterThanOrEqual(ESCAPE.y0); }
  });
  it('los compañeros siguen a la goleadora adonde vaya', () => {
    const { m, me } = goal(); tick(m, inp(), 40); tick(m, inp({ mx: -1 }), 150);
    const mates = m.players.filter((p) => p.cele?.role === 'join');
    expect(mates.length).toBeGreaterThan(2);
    for (const p of mates) expect(Math.hypot(p.x - me.x, p.y - me.y)).toBeLessThan(90);
  });
});
