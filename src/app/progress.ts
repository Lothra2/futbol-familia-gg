import { LEVEL_XP, levelForXp, type SaveV1 } from '../save/save';
import type { CharId } from '../core/types';
import type { Match } from '../core/state';
import { FIELD_CHARS } from '../core/teams';

/** XP of each action (GAME_DESIGN section 11). */
export const XP = { match: 15, goal: 10, goalSpecialBonus: 5, assist: 6, steal: 2, save: 3, win: 10 } as const;
export const PRIZES: Record<number, string> = { 2: 'Traje Arcoíris', 3: 'Celebración dorada', 4: 'Traje Estrellas', 5: 'Estela dorada en el especial' };

export interface PlayerResult { id: CharId; xp: number; level: number; levelUps: { level: number; prize: string }[] }
export interface MatchResult { team0: number; team1: number; win: boolean; draw: boolean; chars: PlayerResult[]; newRecords: string[] }

/** What a character earned in a match, from the counters of the core. */
export function xpOf(m: Match, id: CharId, won: boolean): number {
  const p = m.players.find((q) => q.team === 0 && q.charId === id);
  if (!p) return 0;
  const s = p.stats2;
  return XP.match + s.goals * XP.goal + s.spGoals * XP.goalSpecialBonus + s.assists * XP.assist + s.steals * XP.steal + (id === 'thor' ? s.saves * XP.save : 0) + (won ? XP.win : 0);
}

/** Adds the XP of a finished match to the save (all the family that played, Thor included), updates the records and says what changed. */
export function applyMatch(save: SaveV1, m: Match): MatchResult {
  const [a, b] = m.score, won = a > b || (a === b && m.penWinner === 0), draw = a === b && m.penWinner === null;
  const chars: PlayerResult[] = [];
  const played = m.players.filter((q) => q.team === 0 && q.charId).map((q) => q.charId!) as CharId[];
  for (const id of played) {
    const c = save.characters[id], before = levelForXp(c.xp), gain = xpOf(m, id, won);
    c.xp += gain; c.level = levelForXp(c.xp);
    const ups: PlayerResult['levelUps'] = [];
    for (let l = before + 1; l <= c.level; l++) ups.push({ level: l, prize: PRIZES[l] });
    chars.push({ id, xp: gain, level: c.level, levelUps: ups });
  }
  const r = save.records, recs: string[] = [];
  const goals = m.players.filter((q) => q.team === 0).reduce((s, q) => s + q.stats2.goals, 0);
  const sp = m.players.filter((q) => q.team === 0).reduce((s, q) => s + q.stats2.spGoals, 0);
  const saves = m.players.find((q) => q.team === 0 && q.charId === 'thor')?.stats2.saves ?? 0;
  r.matches++; r.goals += goals; r.specialGoals += sp; r.thorSaves += saves;
  if (a > b && a - b > r.biggestWin) { r.biggestWin = a - b; recs.push('¡Mayor goleada!'); }
  return { team0: a, team1: b, win: won, draw, chars, newRecords: recs };
}

/** Which outfits a character may wear at its level. */
export const outfitsFor = (level: number): ('base' | 'arcoiris' | 'estrellas')[] => ['base', ...(level >= 2 ? ['arcoiris' as const] : []), ...(level >= 4 ? ['estrellas' as const] : [])];
export const goldenCelebration = (level: number): boolean => level >= 3;
export const goldenTrail = (level: number): boolean => level >= 5;
export const xpToNext = (xp: number): { level: number; into: number; need: number } | null => {
  const l = levelForXp(xp);
  if (l >= LEVEL_XP.length) return null;
  return { level: l, into: xp - LEVEL_XP[l - 1], need: LEVEL_XP[l] - LEVEL_XP[l - 1] };
};
void FIELD_CHARS;
