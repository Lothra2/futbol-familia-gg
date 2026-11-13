import { describe, expect, it } from 'vitest';
import { step } from '../../src/core/match';
import { PITCH } from '../../src/core/field';
import { T } from '../../src/core/tuning';
import { clear, fam, mk, put } from './helpers';
import { cameraTarget } from '../../src/core/camera';
import { sx } from '../../src/core/proj';

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
  it('como en Nintendo World Cup: cada uno se queda donde está, de frente a la cámara, saltando con los brazos arriba; el goleador salta más alto', () => {
    const { m, s } = goal();
    const mates = m.players.filter((p) => p.cele?.role === 'join'), at = new Map(m.players.map((p) => [p.id, [p.x, p.y]]));
    let top = 0, mateTop = 0, hops = 0, wasUp = false;
    for (let i = 0; i < Math.round(T.goalT * 60) - 2; i++) {
      step(m); top = Math.max(top, s.z); if (s.z > 0 && !wasUp) hops++; wasUp = s.z > 0;
      for (const p of mates) mateTop = Math.max(mateTop, p.z);
      expect(s.cele!.move).toBe('banzai');
    }
    expect(m.phase).toBe('goal');
    expect(hops).toBeGreaterThan(2); expect(mateTop).toBeGreaterThan(6); expect(top).toBeGreaterThan(mateTop);
    for (const p of [s, ...mates]) { const [x, y] = at.get(p.id)!; expect(Math.hypot(p.x - x, p.y - y)).toBeLessThan(3); expect(p.dirY).toBe(1); expect(p.dirX).toBe(0); }
    for (const p of m.players) expect(Number.isFinite(p.x + p.y + p.z)).toBe(true);
  });
  it('la cámara deja el balón en la red y se va con el goleador', () => {
    const { m, s } = goal();
    for (let i = 0; i < 45; i++) step(m);
    const t = cameraTarget(m, 400, 220), ballX = m.ball.x;
    expect(Math.abs(t.x + 200 - sx(s.x))).toBeLessThan(Math.abs(t.x + 200 - sx(ballX)));
  });
  it('en el saque que sigue todos están en su sitio, en el suelo y sin celebrar', () => {
    const { m } = goal();
    for (let i = 0; i < Math.round(T.goalT * 60) + 5; i++) step(m);
    expect(m.phase).toBe('kickoff');
    for (const p of m.players) { expect(p.cele).toBeNull(); expect(p.z).toBe(0); expect(p.state).not.toBe('celebrate'); }
  });
});
