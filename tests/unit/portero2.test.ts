import { describe, expect, it } from 'vitest';
import { createMatch, step } from '../../src/core/match';
import { keeperThink } from '../../src/core/ai/keeper';
import { MID } from '../../src/core/field';
import { T } from '../../src/core/tuning';
import type { Match, Player } from '../../src/core/state';
import { clear, fam, give, put } from './helpers';

/** Thor in his goal and nobody else near. Only he thinks. */
function scene(seed = 1): { m: Match; thor: Player; foe: Player; mate: Player } {
  const m = createMatch({ ai: 'none', skipKickoff: true, seed });
  for (const p of m.players) p.speedMult = 1;
  const thor = fam(m, 'thor'); clear(m, [thor]); put(thor, 14, MID);
  return { m, thor, foe: m.players.find((p) => p.team === 1 && p.role === 'fwd')!, mate: m.players.find((p) => p.team === 0 && p.role === 'def')! };
}
const run = (m: Match, thor: Player, secs: number, each?: () => boolean | void): void => { for (let i = 0; i < secs * 60; i++) { thor.input = keeperThink(m, thor); step(m); if (each?.()) return; } };
const free = (m: Match, o: Partial<Match['ball']>): void => { Object.assign(m.ball, { z: 0, vx: 0, vy: 0, vz: 0, spin: 0, state: 'free', owner: null, inNet: false, scored: null, ...o }); m.ball.lastTouch = { team: 1, player: 99, t: m.t }; };

describe('Thor de portero: ya no se queda mirando', () => {
  it('achica el ángulo: se pone del lado del balón, sin salirse del arco, y sale más cuando un rival lo trae cerca', () => {
    const a = scene(); free(a.m, { x: 420, y: MID + 150, state: 'dead' }); run(a.m, a.thor, 2);
    expect(a.thor.y).toBeGreaterThan(MID + 12); expect(a.thor.y).toBeLessThanOrEqual(MID + T.gk.angle.max + 3);
    const b = scene(); free(b.m, { x: 420, y: MID - 150, state: 'dead' }); run(b.m, b.thor, 2);
    expect(b.thor.y).toBeLessThan(MID - 12);
    // a rival with the ball at 150 px, with a defender on him (so Thor does not charge): he comes off his line to cut the angle
    const c = scene(); put(c.foe, 150, MID + 20); give(c.m, c.foe); put(c.mate, 140, MID + 24); const x0 = c.thor.x;
    run(c.m, c.thor, 1.5, () => { give(c.m, c.foe); });
    expect(c.thor.x).toBeGreaterThan(x0 + 4); expect(c.thor.x).toBeLessThan(60);
  });
  it('en el mano a mano sale a los pies del rival: casi siempre se queda con el balón y a veces pasa de largo', () => {
    let got = 0, missed = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const { m, thor, foe } = scene(seed); put(foe, 70, MID + 12); give(m, foe);
      let ev = '';
      run(m, thor, 3, () => { for (const e of m.events) if (e.who === thor.id && (e.k === 'smother' || e.k === 'whiff')) ev = e.k; m.events = []; if (m.ball.owner === foe.id) { m.ball.x = foe.x - 8; m.ball.y = foe.y; } return ev !== ''; });
      if (ev === 'smother') { got++; expect(m.ball.state).toBe('held'); expect(m.ball.owner).toBe(thor.id); expect(foe.state).toBe('stagger'); }
      else { expect(ev).toBe('whiff'); missed++; expect(thor.act?.kind).toBe('dive'); }
    }
    expect(got).toBeGreaterThan(missed); expect(missed).toBeGreaterThan(0);
  });
  it('si un defensa ya está encima del rival, Thor no sale: se queda cuidando su arco', () => {
    const { m, thor, foe, mate } = scene(); put(foe, 70, MID + 12); give(m, foe); put(mate, 62, MID + 16);
    run(m, thor, 2, () => { give(m, foe); m.ball.x = foe.x - 8; });
    expect(Math.hypot(thor.x - foe.x, thor.y - foe.y)).toBeGreaterThan(20); expect(m.ball.owner).toBe(foe.id);
  });
  it('un centro que cae en su área es suyo: va debajo y lo agarra, sin contarlo como atajada', () => {
    const { m, thor } = scene(); const saves = thor.stats2.saves;
    free(m, { x: 150, y: MID + 46, z: 50, vx: -90, vy: -6, vz: 90 });
    let caught = false;
    run(m, thor, 3, () => { if (m.events.some((e) => e.k === 'catch' && e.who === thor.id)) caught = true; m.events = []; return caught; });
    expect(caught).toBe(true); expect(m.ball.state).toBe('held'); expect(m.ball.owner).toBe(thor.id); expect(thor.stats2.saves).toBe(saves);
  });
  it('un balón suelto en su área: va por él si llega antes que el rival, y si el rival está encima se queda', () => {
    const a = scene(); free(a.m, { x: 60, y: MID - 72, vx: 0, vy: 175 }); put(a.foe, 260, MID);   // too fast to take at once: he goes to meet it
    run(a.m, a.thor, 3, () => a.m.ball.state === 'held');
    expect(a.m.ball.state).toBe('held'); expect(a.m.ball.owner).toBe(a.thor.id);
    const b = scene(); free(b.m, { x: 96, y: MID - 60, vx: 150, vy: 0 }); put(b.foe, 104, MID - 62); b.foe.noControlT = 9;
    run(b.m, b.thor, 0.5, () => { b.foe.x = b.m.ball.x + 8; b.foe.y = b.m.ball.y; });
    expect(b.thor.x).toBeLessThan(40);
  });
  it('aunque el tiro le gane, se tira por él: nunca lo ve entrar parado', () => {
    let goals = 0, dived = 0;
    for (let seed = 1; seed <= 120; seed++) {
      const { m, thor } = scene(seed);
      const ty = MID + (seed % 2 ? 1 : -1) * T.chance.aim, d = Math.hypot(160, ty - MID);
      free(m, { x: 160, y: MID, vx: (-160 / d) * 420, vy: ((ty - MID) / d) * 420 });
      let sawDive = false;
      run(m, thor, 2, () => { if (thor.state === 'dive') sawDive = true; return m.phase === 'goal'; });
      if (m.phase === 'goal') { goals++; if (sawDive) dived++; }
    }
    expect(goals).toBeGreaterThan(10); expect(dived).toBe(goals);
  });
});
