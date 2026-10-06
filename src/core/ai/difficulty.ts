import { DIFFICULTY, MATES } from '../tuning';
import type { Match, Player } from '../state';

export interface AIParams { reaction: number; shotErr: number; press: number; slideRate: number; humanSlideRate: number; shootRange: number; star: number; special: number }

/** Parameters of the AI of one player. The rivals follow the chosen difficulty and the family mates always play as Normales (GAME_DESIGN section 9). */
export function aiParams(m: Match, p: Player): AIParams {
  const d = p.team === 1 ? DIFFICULTY[m.difficulty] : MATES;
  return {
    reaction: d.reaction, shotErr: d.shotErr, press: d.press, slideRate: p.team === 1 ? 0.15 : 0, humanSlideRate: p.team === 1 ? d.slideHuman : 0,
    shootRange: m.difficulty === 'campeones' && p.team === 1 ? 210 : m.difficulty === 'tranquilos' && p.team === 1 ? 140 : 170, star: p.team === 1 ? d.star : 1, special: d.special,
  };
}

/** Soft adjustment (GAME_DESIGN section 9): when the family is losing by 2 or more the rivals run 5 % slower, when it wins by 4 or more they run 3 % faster. */
export function rubber(m: Match): number {
  const diff = m.score[0] - m.score[1];
  return diff <= -2 ? 0.95 : diff >= 4 ? 1.03 : 1;
}
export function applyRubber(m: Match): void {
  const f = rubber(m);
  for (const p of m.players) if (p.team === 1 && p.control === 'ai') p.speedMult = p.baseSpeed * f;
}
