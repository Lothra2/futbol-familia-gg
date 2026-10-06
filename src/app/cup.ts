import type { SaveV1, Difficulty } from '../save/save';
import type { Match } from '../core/state';
import { KINGDOMS, type Kingdom, type KingdomId } from '../data/kingdoms';

export interface CupOutcome { kind: 'advance' | 'champion' | 'rematch'; stage: number; trophy: KingdomId | null; next: Kingdom | null }

/** The kingdom of the match the Cup is waiting for (stage 0 to 3). */
export const cupKingdom = (save: SaveV1): Kingdom => KINGDOMS[Math.min(3, save.cup.stage)];
export const cupInProgress = (save: SaveV1): boolean => save.cup.active && save.cup.stage > 0 && save.cup.stage < 4;

/** Starts a new Cup from the first match. */
export function startCup(save: SaveV1, difficulty: Difficulty): void { save.cup = { active: true, stage: 0, difficulty }; }

/** Did the family win (on goals or, after a tie, on penalties)? The Cup has no draws: a tie goes to the golden goal and then to penalties. */
export const cupWon = (m: Match): boolean => m.score[0] > m.score[1] || (m.score[0] === m.score[1] && m.penWinner === 0);

/** Applies the result of a Cup match: winning gives the trophy of the kingdom and moves on, the final gives the big cup, and losing repeats the match. */
export function cupMatchResult(save: SaveV1, m: Match): CupOutcome {
  const k = cupKingdom(save);
  if (!cupWon(m)) return { kind: 'rematch', stage: save.cup.stage, trophy: null, next: k };
  save.trophies[k.id] = true;
  save.cup.stage = Math.min(4, save.cup.stage + 1) as 0 | 1 | 2 | 3 | 4;
  if (save.cup.stage === 4) { save.trophies.copa++; save.cup.active = false; return { kind: 'champion', stage: 4, trophy: k.id, next: null }; }
  return { kind: 'advance', stage: save.cup.stage, trophy: k.id, next: KINGDOMS[save.cup.stage] };
}
