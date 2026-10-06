import { createMatch, step, type MatchOptions } from '../../src/core/match';
import { setHumanInput } from '../../src/core/control';
import { botFrame, newBot, type BotKind } from '../../src/core/ai/testbots';
import { DT } from '../../src/core/step';
import type { Match } from '../../src/core/state';

export interface SimResult {
  m: Match; steps: number; goals: [number, number]; shots: [number, number]; saves: [number, number]; specials: [number, number]; kinds: Record<string, number>;
  restarts: Record<string, number>; maxIdleBall: number; maxPhase: Record<string, number>; stuck: number; nan: boolean; seconds: number;
}

/** Plays a whole match without a browser. `bot` drives the human seats (the family player 1), nothing else is scripted. */
export function playMatch(opts: MatchOptions, bot?: BotKind, maxSeconds = 900): SimResult {
  const humans = bot ? [{ team: 0 as const, slot: 3, humanSlot: 0, controls: bot === 'nina5' ? ('easy' as const) : ('full' as const) }] : [];
  const m = createMatch({ ai: 'brain', humans, ...opts });
  const st = bot ? newBot(bot) : null;
  const kinds: Record<string, number> = {}, restarts: Record<string, number> = {}, maxPhase: Record<string, number> = {};
  let n = 0, idle = 0, maxIdle = 0, nan = false, lastPhase = m.phase;
  while (m.phase !== 'over' && n * DT < maxSeconds) {
    if (st && m.humans[0]) setHumanInput(m, 0, botFrame(m, m.humans[0], st));
    step(m); n++;
    for (const e of m.events) {
      if (e.k === 'special') kinds[String(e.v)] = (kinds[String(e.v)] ?? 0) + 1;
      if (e.k === 'throwin' || e.k === 'corner' || e.k === 'goalkick') restarts[e.k] = (restarts[e.k] ?? 0) + 1;
    }
    m.events = [];
    if (m.phase !== lastPhase) { lastPhase = m.phase; }
    maxPhase[m.phase] = Math.max(maxPhase[m.phase] ?? 0, m.phaseT);
    if (![m.ball.x, m.ball.y, m.ball.z].every(Number.isFinite)) nan = true;
    // seconds in a row with the ball loose in open play (a free ball that nobody picks up)
    if (m.phase === 'play' && m.ball.state === 'free') idle += DT; else idle = 0;
    maxIdle = Math.max(maxIdle, idle);
  }
  return { m, steps: n, goals: [...m.stats.goals] as [number, number], shots: [...m.stats.shots] as [number, number], saves: [...m.stats.saves] as [number, number],
    specials: [...m.stats.specials] as [number, number], kinds, restarts, maxIdleBall: maxIdle, maxPhase, stuck: (m.data.stuck as number) ?? 0, nan, seconds: n * DT };
}
