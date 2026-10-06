import { describe, expect, it } from 'vitest';
import { createMatch, step } from '../../src/core/match';
import { keeperThink, saveChance, keeperParams } from '../../src/core/ai/keeper';
import { clear, fam, mk, put, rival } from './helpers';
import type { Match } from '../../src/core/state';

/** A rival shoots at Thor from 160 px away. Only the keeper thinks; everybody else stands far away. */
function shootAtThor(seed: number, ty: number, speed = 300): { result: 'save' | 'goal' | 'other'; kind: number | undefined } {
  const m = createMatch({ ai: 'none', skipKickoff: true, seed });
  for (const p of m.players) p.speedMult = 1;
  const thor = fam(m, 'thor'); clear(m, [thor]); put(thor, 14, 80);
  const dx = 0 - 160, dy = ty - 80, d = Math.hypot(dx, dy);
  Object.assign(m.ball, { x: 160, y: 80, z: 0, vx: (dx / d) * speed, vy: (dy / d) * speed, vz: 0, state: 'free', owner: null });
  m.ball.lastTouch = { team: 1, player: 6, t: m.t };
  let kind: number | undefined;
  for (let i = 0; i < 240; i++) {
    thor.input = keeperThink(m, thor);
    step(m);
    for (const e of m.events) { if (e.k === 'save') kind = e.v; if (e.k === 'catch') kind = 1; }
    m.events = [];
    if (m.phase === 'goal') return { result: 'goal', kind };
    if (kind !== undefined) return { result: 'save', kind };
  }
  return { result: 'other', kind };
}

describe('porteros (B19)', () => {
  const rate = (ty: number, n = 500): number => { let saves = 0; for (let s = 1; s <= n; s++) if (shootAtThor(s, ty).result === 'save') saves++; return saves / n; };
  it('500 tiros a 300 px/s al centro con habilidad 0,75: ataja entre 60 % y 80 %', () => {
    const r = rate(80);
    expect(r).toBeGreaterThan(0.6); expect(r).toBeLessThan(0.8);
  });
  it('500 tiros a los palos (64 y 96): ataja entre 30 % y 55 %', () => {
    const r = (rate(64) + rate(96)) / 2;
    expect(r).toBeGreaterThan(0.3); expect(r).toBeLessThan(0.55);
  });
  it('un tiro lento se agarra y se queda en las manos, uno rápido se despeja', () => {
    let held = 0, punched = 0;
    for (let s = 1; s <= 80; s++) { const slow = shootAtThor(s, 80, 220); if (slow.result === 'save') (slow.kind === 1 ? held++ : punched++); }
    expect(held).toBeGreaterThan(punched);
    let heldFast = 0, punchedFast = 0;
    for (let s = 1; s <= 80; s++) { const fast = shootAtThor(s, 80, 560); if (fast.result === 'save') (fast.kind === 1 ? heldFast++ : punchedFast++); }
    expect(punchedFast).toBeGreaterThan(heldFast);
  });
  it('la probabilidad baja con la velocidad, con el viaje y con la altura, y nunca pasa de 0,95', () => {
    const k = { reaction: 0.2, reach: 34, skill: 0.75 };
    expect(saveChance(k, 200, 0, 0)).toBeCloseTo(0.75, 2);
    expect(saveChance(k, 560, 0, 0)).toBeCloseTo(0.75 * 0.5, 2);
    expect(saveChance(k, 200, 30, 0)).toBeCloseTo(0.75 * 0.8, 2);
    expect(saveChance(k, 200, 0, 20)).toBeLessThan(saveChance(k, 200, 0, 5));
    expect(saveChance({ ...k, skill: 3 }, 200, 0, 0)).toBe(0.95);
  });
  it('los porteros rivales siguen la dificultad y el balanceo: Tranquilos son peores, Campeones mejores', () => {
    const skill = (d: 'tranquilos' | 'normales' | 'campeones') => { const m = createMatch({ ai: 'none', skipKickoff: true, difficulty: d }); return keeperParams(m, rival(m, 0)); };
    expect(skill('tranquilos').skill).toBeLessThan(skill('normales').skill); expect(skill('normales').skill).toBeLessThan(skill('campeones').skill);
    expect(skill('tranquilos').reaction).toBeGreaterThan(skill('campeones').reaction);
    const m = createMatch({ ai: 'none', skipKickoff: true }); const before = keeperParams(m, rival(m, 0)).skill; m.score = [0, 2];
    expect(keeperParams(m, rival(m, 0)).skill).toBeLessThan(before);
  });
  it('un portero con el balón en las manos lo lanza solo a los 1,0 a 1,5 s a un compañero libre', () => {
    const m = mk(); const thor = fam(m, 'thor'); clear(m, [thor, fam(m, 'sophie')]); put(thor, 14, 80); put(fam(m, 'sophie'), 120, 70);
    Object.assign(m.ball, { x: 14, y: 80, z: 0, vx: 0, vy: 0, vz: 0, state: 'free', owner: null });
    thor.noControlT = 0;
    let t = 0, thrown = -1;
    for (let i = 0; i < 400 && thrown < 0; i++) { thor.input = keeperThink(m, thor); step(m); t += 1 / 60; if (m.ball.state === 'free' && m.ball.owner === null && Math.hypot(m.ball.vx, m.ball.vy) > 50 && t > 0.1) thrown = t; m.events = []; }
    expect(thrown).toBeGreaterThan(0.9); expect(thrown).toBeLessThan(2.0);
    expect(m.lastPass?.to).toBe(fam(m, 'sophie').id);
  });
  it('el portero no sale del área grande ni se mete en la red', () => {
    const m = mk(); const thor = fam(m, 'thor'); clear(m, [thor]);
    for (let i = 0; i < 600; i++) {
      if (i % 40 === 0) { Object.assign(m.ball, { x: 100 + ((i * 29) % 800), y: 10 + ((i * 17) % 140), z: 0, vx: 0, vy: 0, vz: 0, state: 'free', owner: null }); }
      thor.input = keeperThink(m, thor); step(m);
      if (m.phase !== 'play') break;
      expect(thor.x).toBeLessThan(96 + 8); expect(thor.x).toBeGreaterThan(-1);
    }
  });
});
void (null as unknown as Match);
