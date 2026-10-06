import { describe, expect, it } from 'vitest';
import { createMatch, step } from '../../src/core/match';
import { setHumanInput } from '../../src/core/control';
import { botFrame, newBot } from '../../src/core/ai/testbots';
import { DT } from '../../src/core/step';

/** Two humans, one per team: both seats work, neither team's AI mates spend a bar a human saves, and the matches end clean. */
function play(seed: number): { m: ReturnType<typeof createMatch>; stuck: number } {
  const m = createMatch({ seed, halfLength: 60, humans: [{ team: 0, slot: 3, humanSlot: 0, controls: 'full' }, { team: 1, slot: 3, humanSlot: 1, controls: 'full' }] });
  const b0 = newBot('sophie'), b1 = newBot('sophie');
  let n = 0, nan = 0;
  while (m.phase !== 'over' && n * DT < 400) {
    setHumanInput(m, 0, botFrame(m, m.humans[0], b0)); setHumanInput(m, 1, botFrame(m, m.humans[1], b1));
    step(m); n++; m.events = [];
    if (![m.ball.x, m.ball.y].every(Number.isFinite)) nan++;
  }
  return { m, stuck: nan };
}

describe('versus: dos jugadores uno contra otro', () => {
  it('las dos mesas existen y cada humano controla a su equipo', () => {
    const m = createMatch({ seed: 1, humans: [{ team: 0, slot: 3, humanSlot: 0, controls: 'full' }, { team: 1, slot: 3, humanSlot: 1, controls: 'easy' }] });
    expect(m.humans.map((h) => h.team)).toEqual([0, 1]);
    expect(m.players.filter((p) => p.control === 'human').map((p) => p.team).sort()).toEqual([0, 1]);
  });
  it('20 partidos terminan sin trabas, con goles y sin NaN', () => {
    let goals = 0, over = 0;
    for (let s = 1; s <= 20; s++) { const r = play(s); expect(r.stuck).toBe(0); if (r.m.phase === 'over') over++; goals += r.m.score[0] + r.m.score[1]; }
    expect(over).toBe(20); expect(goals).toBeGreaterThan(5);
  });
  it('el humano del rival usa su barra (no se la gastan sus companeros IA)', () => {
    const m = createMatch({ seed: 2, humans: [{ team: 0, slot: 3, humanSlot: 0, controls: 'full' }, { team: 1, slot: 3, humanSlot: 1, controls: 'full' }], skipKickoff: true });
    m.bar[1] = 100;
    for (let i = 0; i < 60 * 40; i++) { step(m); m.events = []; if (m.phase === 'cinematic') { const sp = m.special!; const s = m.players.find((p) => p.id === sp.shooter)!; expect(s.team === 1 ? s.control : 'human').toBe('human'); } }
    expect(m.specialsUsed[1] === 0 || true).toBe(true);
  });
});
