import { describe, expect, it } from 'vitest';
import { step } from '../../src/core/match';
import { PITCH } from '../../src/core/field';
import { T } from '../../src/core/tuning';
import { clear, fam, mk, put } from './helpers';

/** Sophie scores: the ball is in the net of the rivals and she touched it last. */
function goal(who: 'sophie' | 'papa' | 'alana' | 'mama' | 'juandi' = 'sophie') {
  const m = mk(); clear(m);
  const s = fam(m, who); put(s, 880, 200);
  m.players.filter((p) => p.team === 0 && p.role !== 'gk' && p !== s).forEach((p, i) => put(p, 700 + i * 30, 120 + i * 50));
  Object.assign(m.ball, { state: 'free', owner: null, x: PITCH.w + 4, y: 200, z: 5, vx: 0, vy: 0, vz: 0, inNet: true, scored: 0 });
  m.ball.lastTouch = { team: 0, player: s.id, t: m.t };
  step(m);
  return { m, s };
}

describe('la celebración del gol', () => {
  it('el goleador es la estrella, sus compañeros van hacia él y Thor da vueltas en su arco; los rivales no celebran', () => {
    const { m, s } = goal();
    expect(m.phase).toBe('goal'); expect(s.cele?.role).toBe('star');
    for (const p of m.players) {
      if (p.team === 1) { expect(p.cele).toBeNull(); expect(p.state).toBe('sad'); }
      else if (p.role === 'gk') expect(p.cele?.move).toBe('zoom');
      else if (p !== s) expect(p.cele?.role).toBe('join');
    }
  });
  it('corre, hace su jugada (salta o se barre de rodillas) y termina con el puño arriba; los demás llegan a saltar con él', () => {
    const { m, s } = goal();
    const x0 = s.x, moves = new Set<string>(); let top = 0, starHops = 0, wasUp = false, signature = false;
    const mates = m.players.filter((p) => p.cele?.role === 'join'), d0 = mates.map((p) => Math.hypot(p.x - s.x, p.y - s.y));
    let mateTop = 0;
    for (let i = 0; i < Math.round(T.goalT * 60) - 2; i++) {
      step(m); moves.add(s.cele!.move); top = Math.max(top, s.z);
      if (m.events.some((e) => e.k === 'celemove' && e.who === s.id)) signature = true; m.events = [];
      if (s.cele!.move === 'pump') { if (s.z > 0 && !wasUp) starHops++; wasUp = s.z > 0; }
      for (const p of mates) mateTop = Math.max(mateTop, p.z);
    }
    expect(m.phase).toBe('goal');
    expect(Math.abs(s.x - x0)).toBeGreaterThan(25);            // he ran
    expect(signature).toBe(true); expect(moves.has('run')).toBe(true); expect(moves.has('pump')).toBe(true);
    expect(starHops).toBeGreaterThan(1);
    mates.forEach((p, i) => { expect(Math.hypot(p.x - s.x, p.y - s.y)).toBeLessThan(Math.min(60, d0[i])); });
    expect(mateTop).toBeGreaterThan(6);
    for (const p of m.players) { expect(Number.isFinite(p.x + p.y + p.z)).toBe(true); expect(p.y).toBeGreaterThan(-25); expect(p.y).toBeLessThan(PITCH.d + 25); }
  });
  it('cada jugador tiene su jugada: entre los cinco de la familia hay voltereta, barrida de rodillas y salto con giro', () => {
    const seen = new Set<string>();
    for (const who of ['sophie', 'papa', 'alana', 'mama', 'juandi'] as const) {
      const { m, s } = goal(who);
      for (let i = 0; i < 90; i++) { step(m); seen.add(s.cele!.move); }
    }
    for (const mv of ['flip', 'slide', 'spin']) expect(seen.has(mv), mv).toBe(true);
  });
  it('en el saque que sigue todos están en su sitio, en el suelo y sin celebrar', () => {
    const { m } = goal();
    for (let i = 0; i < Math.round(T.goalT * 60) + 5; i++) step(m);
    expect(m.phase).toBe('kickoff');
    for (const p of m.players) { expect(p.cele).toBeNull(); expect(p.z).toBe(0); expect(p.state).not.toBe('celebrate'); }
  });
});
