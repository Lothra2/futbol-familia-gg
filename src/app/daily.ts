import type { SaveV1 } from '../save/save';
import { CHAR_IDS } from '../core/types';
import { levelForXp } from '../save/save';
import type { Match } from '../core/state';
import type { MatchConfig } from './controller';
import { PRIZES } from './progress';

/** What a match tells about one challenge. */
interface Ctx { m: Match; cfg: MatchConfig; won: boolean; conceded: number; goals: number }
export interface DailyDef { id: string; text: string; need: number; measure: (c: Ctx) => number }
const fam = (m: Match) => m.players.filter((p) => p.team === 0);
const sum = (m: Match, f: (s: Match['players'][number]['stats2']) => number): number => fam(m).reduce((a, p) => a + f(p.stats2), 0);
const TEAM: Record<string, string> = { dragon: 'los Dragoncitos', tiburon: 'los Tiburoncitos', buho: 'los Búhos', mapache: 'los Mapachitos' };

/** The pool the three of the day come from. */
export const POOL: DailyDef[] = [
  { id: 'goles', text: 'Marca 3 goles', need: 3, measure: (c) => c.goals },
  { id: 'especial', text: 'Marca un gol con un poder', need: 1, measure: (c) => sum(c.m, (s) => s.spGoals) },
  { id: 'asistencias', text: 'Da 2 asistencias', need: 2, measure: (c) => sum(c.m, (s) => s.assists) },
  { id: 'robos', text: 'Roba el balón 4 veces', need: 4, measure: (c) => sum(c.m, (s) => s.steals) },
  { id: 'atajadas', text: 'Que Thor ataje 4 tiros', need: 4, measure: (c) => sum(c.m, (s) => s.saves) },
  { id: 'invicto', text: 'Gana sin recibir gol', need: 1, measure: (c) => (c.won && c.conceded === 0 ? 1 : 0) },
  { id: 'goleada', text: 'Gana por 2 goles o más', need: 1, measure: (c) => (c.won && c.goals - c.conceded >= 2 ? 1 : 0) },
  { id: 'victorias', text: 'Gana 2 partidos', need: 2, measure: (c) => (c.won ? 1 : 0) },
  { id: 'pases', text: 'Haz 15 pases', need: 15, measure: (c) => sum(c.m, (s) => s.passes) },
  { id: 'altos', text: 'Haz 3 pases altos', need: 3, measure: (c) => sum(c.m, (s) => s.chips) },
  { id: 'jugar', text: 'Juega 2 partidos', need: 2, measure: () => 1 },
  ...(['tiburon', 'buho', 'mapache', 'dragon'] as const).map((sp) => ({ id: `gana_${sp}`, text: `Gánale a ${TEAM[sp]}`, need: 1, measure: (c: Ctx) => (c.won && c.cfg.rival === sp ? 1 : 0) })),
];
export const BONUS_XP = 20, ALL_BONUS_XP = 30;

/** The date of today as YYYY-MM-DD in the local time of the player. */
export const today = (d: Date = new Date()): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayBefore = (iso: string): string => { const [y, mo, da] = iso.split('-').map(Number); return today(new Date(y, mo - 1, da - 1)); };

/** The same three challenges for everybody on the same date (no two alike). */
export function dailyOf(date: string): [DailyDef, DailyDef, DailyDef] {
  let seed = 0; for (const ch of date) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const rnd = (): number => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const pool = [...POOL], out: DailyDef[] = [];
  while (out.length < 3) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
  return out as [DailyDef, DailyDef, DailyDef];
}

/** A new day starts from zero, and a day with the streak broken starts the streak again. */
export function rollDay(save: SaveV1, date: string = today()): void {
  const d = save.daily;
  if (d.date === date) return;
  if (d.lastAllDone !== dayBefore(date) && d.lastAllDone !== date) d.streak = 0;
  d.date = date; d.progress = [0, 0, 0]; d.done = [false, false, false];
}

export interface DailyResult { newlyDone: string[]; xp: number; all: boolean; streak: number; levelUps: { id: string; level: number; prize: string }[] }

/** Adds what a finished match did to today's challenges, pays the bonus XP of the ones just completed to the whole family. */
export function applyDaily(save: SaveV1, m: Match, cfg: MatchConfig, date: string = today()): DailyResult {
  rollDay(save, date);
  const d = save.daily, defs = dailyOf(date);
  const won = m.score[0] > m.score[1] || (m.score[0] === m.score[1] && m.penWinner === 0);
  const ctx: Ctx = { m, cfg, won, conceded: m.score[1], goals: m.score[0] };
  const newly: string[] = [];
  defs.forEach((def, i) => {
    if (d.done[i]) return;
    d.progress[i] = Math.min(def.need, d.progress[i] + def.measure(ctx));
    if (d.progress[i] >= def.need) { d.done[i] = true; newly.push(def.text); }
  });
  let xp = newly.length * BONUS_XP;
  const all = d.done.every(Boolean) && newly.length > 0;
  if (all) { xp += ALL_BONUS_XP; d.streak = d.lastAllDone === dayBefore(date) ? d.streak + 1 : 1; d.lastAllDone = date; }
  const levelUps: DailyResult['levelUps'] = [];
  if (xp > 0) for (const id of CHAR_IDS) {
    const c = save.characters[id], before = levelForXp(c.xp);
    c.xp += xp; c.level = levelForXp(c.xp);
    for (let l = before + 1; l <= c.level; l++) levelUps.push({ id, level: l, prize: PRIZES[l] });
  }
  return { newlyDone: newly, xp, all, streak: d.streak, levelUps };
}
