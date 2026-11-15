import { describe, expect, it } from 'vitest';
import { createMatch, step } from '../../src/core/match';

describe('el portero ante un especial', () => {
  it('cuando el especial es gol el portero no se quita: termina frente al balón y el poder se lo lleva', () => {
    let goals = 0, worst = 0;
    for (let seed = 1; seed <= 12 && goals < 8; seed++) {
      const m = createMatch({ ai: 'brain', skipKickoff: true, seed });
      m.bar[0] = 100; m.bar[1] = 100;
      let last: { y1: number; keeper: number; outcome: string } | null = null;
      for (let i = 0; i < 60 * 150; i++) {
        step(m, 1 / 60);
        if (i % 600 === 0) { m.bar[0] = 100; m.bar[1] = 100; }
        const f = m.flight;
        if (f && f.keeper !== null) last = { y1: f.y1, keeper: f.keeper, outcome: f.outcome };
        else if (last) {
          if (last.outcome === 'goal') { const k = m.players.find((p) => p.id === last!.keeper); if (k) { goals++; worst = Math.max(worst, Math.abs(k.y - last.y1)); } }
          last = null;
        }
      }
    }
    console.log('especiales de gol', goals, 'peor distancia del portero al balon', worst.toFixed(1));
    expect(goals).toBeGreaterThan(0);
    expect(worst).toBeLessThan(30);
  });
});
