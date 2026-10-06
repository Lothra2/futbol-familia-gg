import { ARC, DIFFICULTY, MATES, STYLE } from '../tuning';
import type { Match, Player } from '../state';

export interface AIParams { reaction: number; shotErr: number; press: number; slideRate: number; humanSlideRate: number; shootRange: number; star: number; special: number;
  /** The style of the kingdom of a rival (tuning.ts STYLE): how often it plays progressive passes and crosses (1 = as usual) and whether it counters after winning the ball. */
  passBias: number; crossBias: number; counter: number }

/** Parameters of the AI of one player. The rivals follow the chosen difficulty and the family mates always play as Normales (GAME_DESIGN section 9). */
export function aiParams(m: Match, p: Player): AIParams {
  const d = p.team === 1 ? DIFFICULTY[m.difficulty] : MATES;
  const st = p.team === 1 && p.species ? STYLE[p.species] : null;
  // with an easy-controls child on the family the styles are felt at half strength (no extra presser)
  const soft = m.players.some((q) => q.team === 0 && q.control === 'human' && q.controls === 'easy') ? 0.5 : 1;
  const k = (v: number): number => 1 + (v - 1) * soft;
  const arc = p.team === 1 ? ARC.react[Math.max(0, Math.min(3, (m.data.arc as number) ?? 0))] ?? 0 : 0;
  const range = m.difficulty === 'campeones' && p.team === 1 ? 190 : m.difficulty === 'tranquilos' && p.team === 1 ? 120 : 150;
  return {
    reaction: Math.max(0.08, d.reaction - arc), shotErr: d.shotErr, press: d.press + (st && soft === 1 ? st.press : 0), slideRate: p.team === 1 ? 0.15 : 0, humanSlideRate: p.team === 1 ? d.slideHuman : 0,
    shootRange: range * k(st?.range ?? 1), star: p.team === 1 ? d.star : 1, special: d.special,
    passBias: k(st?.pass ?? 1), crossBias: k(st?.cross ?? 1), counter: st ? st.counter * soft : 0,
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
