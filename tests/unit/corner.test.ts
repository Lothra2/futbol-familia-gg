import { describe, expect, it } from 'vitest';
import { PITCH } from '../../src/core/field';
import { createMatch, step } from '../../src/core/match';
import { T } from '../../src/core/tuning';
import type { Match } from '../../src/core/state';

/** A corner for `team`, played by the AI of both sides, until somebody touches the ball. Returns the team of that first touch. */
function corner(seed: number, team: 0 | 1, top: boolean): { first: number | null; inBox: number; to: number | null; m: Match } {
  const m = createMatch({ ai: 'brain', skipKickoff: true, seed });
  for (let i = 0; i < 60; i++) step(m, 1 / 60);
  const b = m.ball, gx = team === 0 ? PITCH.w : 0;
  Object.assign(b, { state: 'free', owner: null, x: gx + (team === 0 ? -6 : 6), y: top ? 30 : PITCH.d - 30, z: 0, vx: team === 0 ? 300 : -300, vy: 0, vz: 0 });
  b.lastTouch = { team: team === 0 ? 1 : 0, player: m.players.find((p) => p.team !== team && p.role !== 'gk')!.id, t: m.t };
  for (let i = 0; i < 120 && m.phase !== 'restart'; i++) step(m, 1 / 60);
  expect(m.restart?.kind).toBe('corner');
  const taker = m.restart!.taker;
  for (let i = 0; i < 300 && m.phase === 'restart'; i++) step(m, 1 / 60);
  const inBox = m.players.filter((p) => p.team === team && p.role !== 'gk' && p.id !== taker && Math.abs(p.x - gx) < T.corner.reach).length;
  const to = m.lastPass && m.lastPass.from === taker ? m.lastPass.to : null;
  let first: number | null = null;
  for (let i = 0; i < 240 && first === null; i++) {
    step(m, 1 / 60);
    if (m.ball.lastTouch.player !== taker && m.ball.lastTouch.t > m.t - 0.05) first = m.ball.lastTouch.team;
    if (m.phase !== 'play') break;
  }
  return { first, inBox, to, m };
}

describe('el tiro de esquina', () => {
  it('el equipo que lo cobra mete gente al área y el centro le llega a uno de los suyos la mayoría de las veces', () => {
    let mine = 0, theirs = 0, box = 0, n = 0;
    for (let seed = 1; seed <= 40; seed++) for (const team of [0, 1] as const) {
      const r = corner(seed, team, seed % 2 === 0); n++;
      box += r.inBox;
      if (r.first === team) mine++; else if (r.first !== null) theirs++;
    }
    console.log('corner: own', mine, 'rival', theirs, 'of', n, 'in box avg', (box / n).toFixed(2));
    expect(box / n).toBeGreaterThanOrEqual(2);
    expect(mine).toBeGreaterThan(theirs);
  });
  it('con la palanca quieta el centro va a un compañero, no al frente del arco vacío', () => {
    const r = corner(3, 0, true);
    const mate = r.m.players.find((p) => p.id === r.to);
    expect(mate?.team).toBe(0); expect(mate?.role).not.toBe('gk');
  });
});
