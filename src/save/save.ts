import { CHAR_IDS, type CharId } from '../core/types';

export const SAVE_KEY = 'futbol-familia/save';
export const SAVE_VERSION = 1;

export type Outfit = 'base' | 'arcoiris' | 'estrellas';
export type ControlsPref = 'easy' | 'full';
export type Difficulty = 'tranquilos' | 'normales' | 'campeones';
export interface CharSave { xp: number; level: number; outfit: Outfit }
export interface SaveV1 {
  version: 1;
  settings: {
    music: number; sfx: number; crowd: number; muted: boolean; halfLength: 60 | 90 | 120; cinematics: 'full' | 'short' | 'off';
    reducedMotion: boolean; narrator: boolean; replay: boolean; mirrorP2: boolean; touchControls: 'auto' | 'on' | 'off'; controls: [ControlsPref, ControlsPref]; difficulty: Difficulty;
  };
  characters: Record<CharId, CharSave>;
  cup: { active: boolean; stage: 0 | 1 | 2 | 3 | 4; difficulty: Difficulty };
  trophies: { bosque: boolean; arrecife: boolean; nubes: boolean; volcan: boolean; copa: number };
  records: { goals: number; biggestWin: number; specialGoals: number; thorSaves: number; matches: number };
  stats: { trainingDone: boolean; guideSeen: boolean };
  /** The three challenges of the day: progress, which are done and the streak of days with all three. */
  daily: { date: string; progress: [number, number, number]; done: [boolean, boolean, boolean]; streak: number; lastAllDone: string };
}

export const defaultSave = (): SaveV1 => ({
  version: 1,
  settings: { music: 0.7, sfx: 0.8, crowd: 0.7, muted: false, halfLength: 90, cinematics: 'full', reducedMotion: false, narrator: true, replay: true, mirrorP2: false, touchControls: 'auto', controls: ['full', 'full'], difficulty: 'normales' },
  characters: Object.fromEntries(CHAR_IDS.map((c) => [c, { xp: 0, level: 1, outfit: 'base' as Outfit }])) as Record<CharId, CharSave>,
  cup: { active: false, stage: 0, difficulty: 'normales' },
  trophies: { bosque: false, arrecife: false, nubes: false, volcan: false, copa: 0 },
  records: { goals: 0, biggestWin: 0, specialGoals: 0, thorSaves: 0, matches: 0 },
  stats: { trainingDone: false, guideSeen: false },
  daily: { date: '', progress: [0, 0, 0], done: [false, false, false], streak: 0, lastAllDone: '' },
});

/** XP needed for each level (GAME_DESIGN section 11). */
export const LEVEL_XP = [0, 60, 150, 280, 450];
export const levelForXp = (xp: number): number => { let l = 1; for (let i = 1; i < LEVEL_XP.length; i++) if (xp >= LEVEL_XP[i]) l = i + 1; return l; };

/** Upgrades older saves. Every step takes version n to n+1. There is only v1 for now. */
export const MIGRATIONS: Record<number, (s: any) => any> = {};

const isObj = (v: unknown): v is Record<string, any> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, d: number, lo = -Infinity, hi = Infinity): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const oneOf = <T>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);
const DIFFS: Difficulty[] = ['tranquilos', 'normales', 'campeones'];

/** Fills missing fields with defaults and drops anything out of range, so a half-valid save never breaks the game. */
export function sanitize(raw: any): SaveV1 {
  const d = defaultSave();
  if (!isObj(raw)) return d;
  const s = isObj(raw.settings) ? raw.settings : {};
  const ctl = Array.isArray(s.controls) ? s.controls : [];
  d.settings = {
    music: num(s.music, d.settings.music, 0, 1), sfx: num(s.sfx, d.settings.sfx, 0, 1), crowd: num(s.crowd, d.settings.crowd, 0, 1), muted: s.muted === true,
    halfLength: oneOf(s.halfLength, [60, 90, 120] as const, 90), cinematics: oneOf(s.cinematics, ['full', 'short', 'off'] as const, 'full'),
    reducedMotion: s.reducedMotion === true, narrator: s.narrator !== false, replay: s.replay !== false, mirrorP2: s.mirrorP2 === true, touchControls: oneOf(s.touchControls, ['auto', 'on', 'off'] as const, 'auto'),
    controls: [oneOf(ctl[0], ['easy', 'full'] as const, 'full'), oneOf(ctl[1], ['easy', 'full'] as const, 'full')],
    difficulty: oneOf(s.difficulty, DIFFS, 'normales'),
  };
  for (const c of CHAR_IDS) {
    const cs = isObj(raw.characters) && isObj(raw.characters[c]) ? raw.characters[c] : {};
    const xp = Math.floor(num(cs.xp, 0, 0, 1e6));
    const level = levelForXp(xp);
    const outfit: Outfit = cs.outfit === 'arcoiris' && level >= 2 ? 'arcoiris' : cs.outfit === 'estrellas' && level >= 4 ? 'estrellas' : 'base';
    d.characters[c] = { xp, level, outfit };
  }
  const cu = isObj(raw.cup) ? raw.cup : {};
  d.cup = { active: cu.active === true, stage: oneOf(cu.stage, [0, 1, 2, 3, 4] as const, 0), difficulty: oneOf(cu.difficulty, DIFFS, 'normales') };
  const t = isObj(raw.trophies) ? raw.trophies : {};
  d.trophies = { bosque: t.bosque === true, arrecife: t.arrecife === true, nubes: t.nubes === true, volcan: t.volcan === true, copa: Math.floor(num(t.copa, 0, 0, 1e6)) };
  const r = isObj(raw.records) ? raw.records : {};
  d.records = { goals: Math.floor(num(r.goals, 0, 0, 1e6)), biggestWin: Math.floor(num(r.biggestWin, 0, 0, 1e3)), specialGoals: Math.floor(num(r.specialGoals, 0, 0, 1e6)), thorSaves: Math.floor(num(r.thorSaves, 0, 0, 1e6)), matches: Math.floor(num(r.matches, 0, 0, 1e6)) };
  const st = isObj(raw.stats) ? raw.stats : {};
  d.stats = { trainingDone: st.trainingDone === true, guideSeen: st.guideSeen === true };
  const dl = isObj(raw.daily) ? raw.daily : {};
  const arr3 = (v: unknown, f: (x: unknown) => number | boolean): any => (Array.isArray(v) && v.length === 3 ? v.map(f) : null);
  d.daily = {
    date: typeof dl.date === 'string' ? dl.date.slice(0, 10) : '', progress: arr3(dl.progress, (x) => num(x, 0, 0, 1e4)) ?? [0, 0, 0],
    done: arr3(dl.done, (x) => x === true) ?? [false, false, false], streak: Math.floor(num(dl.streak, 0, 0, 1e4)), lastAllDone: typeof dl.lastAllDone === 'string' ? dl.lastAllDone.slice(0, 10) : '',
  };
  return d;
}

export function migrate(raw: any): SaveV1 {
  let cur = raw;
  let v = isObj(cur) && typeof cur.version === 'number' ? cur.version : 1;
  while (v < SAVE_VERSION) { const f = MIGRATIONS[v]; if (!f) break; cur = f(cur); v++; }
  return sanitize(cur);
}

export interface StorageLike { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem?(k: string): void }
export type LoadStatus = 'ok' | 'fresh' | 'recovered' | 'memory';

/** Reads and writes progress. Corrupt data is kept as a dated backup and the game starts clean. Blocked storage falls back to memory. */
export class SaveStore {
  data: SaveV1 = defaultSave();
  status: LoadStatus = 'fresh';
  private mem = false;
  constructor(private storage: () => StorageLike | null = () => { try { return window.localStorage; } catch { return null; } }, private now: () => number = Date.now) {}

  load(): SaveV1 {
    let st: StorageLike | null = null;
    try { st = this.storage(); } catch { st = null; }
    if (!st) { this.mem = true; this.status = 'memory'; this.data = defaultSave(); return this.data; }
    let text: string | null = null;
    try { text = st.getItem(SAVE_KEY); } catch { this.mem = true; this.status = 'memory'; this.data = defaultSave(); return this.data; }
    if (text === null) { this.status = 'fresh'; this.data = defaultSave(); return this.data; }
    try {
      const parsed = JSON.parse(text);
      if (!isObj(parsed)) throw new Error('shape');
      this.data = migrate(parsed); this.status = 'ok';
    } catch {
      try { st.setItem(`${SAVE_KEY}.bak-${new Date(this.now()).toISOString().slice(0, 19).replace(/[:T]/g, '-')}`, text); } catch { /* backup is best effort */ }
      this.data = defaultSave(); this.status = 'recovered';
    }
    return this.data;
  }

  save(): boolean {
    if (this.mem) return false;
    try { const st = this.storage(); if (!st) { this.mem = true; this.status = 'memory'; return false; } st.setItem(SAVE_KEY, JSON.stringify(this.data)); return true; }
    catch { this.mem = true; this.status = 'memory'; return false; }
  }
  get persistent(): boolean { return !this.mem; }
}
