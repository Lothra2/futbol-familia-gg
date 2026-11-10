import { describe, expect, it } from 'vitest';
import { createMatch, step } from '../../src/core/match';
import { MID, slotPos } from '../../src/core/field';
import { ball, clear, mk, secs } from './helpers';

describe('sala de espera (Nintendo World Cup)', () => {
  it('con lluvia el balón rueda bastante menos que con sol', () => {
    const run = (weather: 'sol' | 'lluvia'): number => { const m = mk({ weather }); clear(m); ball(m, 100, MID, 0, 300, 0, 0); secs(m, 3); return m.ball.x - 100; };
    const sun = run('sol'), rain = run('lluvia');
    expect(rain).toBeLessThan(sun * 0.85); expect(rain).toBeGreaterThan(sun * 0.4);
  });
  it('con viento el balón alto se desvía hacia donde sopla y el rasante no', () => {
    const m = mk({ weather: 'viento', seed: 4 }); clear(m); const w = m.ball.wind!;
    expect(Math.abs(w)).toBeGreaterThan(0);
    ball(m, 480, MID, 0, 0, 0, 300); m.ball.wind = w; secs(m, 1);
    expect(Math.sign(m.ball.x - 480)).toBe(Math.sign(w)); expect(Math.abs(m.ball.x - 480)).toBeGreaterThan(10);
    const g = mk({ weather: 'viento', seed: 4 }); clear(g); ball(g, 480, MID, 0, 0, 0, 0); g.ball.wind = w; secs(g, 1);
    expect(g.ball.x).toBe(480);
  });
  it('las tres formaciones ponen a los cinco en sitios distintos y el portero siempre al arco', () => {
    const at = (f: '2-1-2' | '1-2-2' | '2-2-1') => [0, 1, 2, 3, 4, 5].map((s) => slotPos(0, s, f));
    expect(at('2-1-2')[0]).toEqual(at('1-2-2')[0]);
    expect(at('2-1-2')).not.toEqual(at('1-2-2')); expect(at('1-2-2')).not.toEqual(at('2-2-1'));
    const m = createMatch({ formation: ['1-2-2', '2-2-1'], skipKickoff: true, ai: 'none' });
    expect(m.players.filter((p) => p.team === 0 && p.role === 'def').length).toBe(1);
    expect(m.players.filter((p) => p.team === 1 && p.role === 'fwd').length).toBe(1);
  });
  it('estrategia: con "pase" los compañeros IA de la familia pasan más que con "gambeta"', () => {
    // the same play forty times: a midfielder of the family with the ball, nobody pressing him and a forward free ahead. With "pase" he
    // plays it forward soon; with "gambeta" he keeps it. (Counting the passes of whole matches drowns the effect in the luck of the play.)
    const passes = (atk: 'pase' | 'gambeta'): number => {
      let n = 0;
      for (let seed = 1; seed <= 40; seed++) {
        const m = createMatch({ seed, ai: 'brain', training: true, strategy: { atk, def: 'mixto' } });
        const c = m.players.find((p) => p.team === 0 && p.role === 'mid')!;
        for (const o of m.players) { if (o.team === 1 && o.role !== 'gk') { o.x = 40; o.y = 10; } if (o.team === 0 && o.role === 'fwd') o.x = 630; }
        c.x = 480; c.y = 80; Object.assign(m.ball, { state: 'owned', owner: c.id, x: c.x, y: c.y, z: 0 });
        for (let i = 0, done = false; i < 90 && !done && m.ball.owner === c.id; i++) { step(m); if (m.events.some((e) => e.k === 'pass' && e.who === c.id)) { done = true; n++; } m.events = []; }
      }
      return n;
    };
    expect(passes('pase')).toBeGreaterThan(passes('gambeta') + 8);
  });
});

describe('golpes de Nekketsu', () => {
  it('una barrida que pega al rival lo manda a volar: sube, sale despedido hacia donde iba la barrida y cae', async () => {
    const { startTumble } = await import('../../src/core/actions');
    const { T } = await import('../../src/core/tuning');
    const { fam } = await import('./helpers');
    const m = mk(); clear(m); const o = fam(m, 'papa'); o.x = 400; o.y = MID;
    startTumble(m, o, T.slide.tumble, T.fly.slide, 0, T.fly.slideVz);
    let top = 0; for (let i = 0; i < 40; i++) { step(m); top = Math.max(top, o.z); }
    expect(top).toBeGreaterThan(15); expect(o.z).toBe(0); expect(o.x).toBeGreaterThan(430);
  });
});
