import { describe, it, expect } from 'vitest';
import { createMatch, step } from '../../src/core/match';
import { setHumanInput } from '../../src/core/control';
import { botFrame, newBot, type BotKind } from '../../src/core/ai/testbots';

/** A throw-in must almost never end in another throw-in. Measured over matches with a bot in the human seat. */
function measure(bot: BotKind, seeds: number[]): { throwins: number; chained: number; outs: number } {
  let throwins = 0, chained = 0, outs = 0;
  for (const seed of seeds) {
    const humans = [{ team: 0 as const, slot: 3, humanSlot: 0, controls: bot === 'nina5' ? ('easy' as const) : ('full' as const) }];
    const m = createMatch({ seed, ai: 'brain', halfLength: 120, humans });
    const st = newBot(bot);
    let last = '', lastT = -99;
    for (let i = 0; i < 60 * 260 && m.phase !== 'over'; i++) {
      if (m.humans[0]) setHumanInput(m, 0, botFrame(m, m.humans[0], st));
      step(m);
      for (const e of m.events) {
        if (e.k === 'throwin' || e.k === 'corner' || e.k === 'goalkick') {
          if (last === 'throwin' && m.t - lastT < 8) { outs++; if (e.k === 'throwin') chained++; }
          if (e.k === 'throwin') throwins++;
          last = e.k; lastT = m.t;
        }
      }
      m.events = [];
    }
  }
  return { throwins, chained, outs };
}

describe('throw-ins', () => {
  for (const bot of ['sophie', 'nina5'] as BotKind[]) {
    it(`do not chain (${bot})`, () => {
      const r = measure(bot, Array.from({ length: 8 }, (_, i) => 200 + i));
      console.log('THROWINS', bot, JSON.stringify(r));
      expect(r.throwins).toBeGreaterThan(0);
      expect(r.outs).toBeLessThanOrEqual(Math.ceil(r.throwins * 0.25));
    });
  }
});
