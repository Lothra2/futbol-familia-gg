import { describe, expect, it } from 'vitest';
import { createMatch } from '../../src/core/match';
import { defaultSave, sanitize } from '../../src/save/save';
import { applyDaily, dailyOf, rollDay, today, POOL, BONUS_XP, ALL_BONUS_XP } from '../../src/app/daily';
import { defaultConfig } from '../../src/app/controller';

const match = (score: [number, number] = [2, 0]): ReturnType<typeof createMatch> => { const m = createMatch({ seed: 1 }); m.score = score; return m; };

describe('desafios del dia', () => {
  it('son 3, distintos, y los mismos para la misma fecha', () => {
    for (const d of ['2026-10-05', '2026-10-06', '2027-01-01']) { const a = dailyOf(d), b = dailyOf(d); expect(a.map((x) => x.id)).toEqual(b.map((x) => x.id)); expect(new Set(a.map((x) => x.id)).size).toBe(3); }
    const ids = new Set<string>(); for (let i = 1; i <= 28; i++) dailyOf(`2026-11-${String(i).padStart(2, '0')}`).forEach((x) => ids.add(x.id));
    expect(ids.size).toBeGreaterThan(8);
  });
  it('el progreso se acumula entre partidos y paga una sola vez', () => {
    const save = defaultSave(), date = '2026-10-05', defs = dailyOf(date);
    const m = match([3, 0]); const fam = m.players.filter((p) => p.team === 0); fam[0].stats2.goals = 3; fam[1].stats2.passes = 20; fam[2].stats2.spGoals = 1; fam[2].stats2.assists = 2; fam[3].stats2.steals = 4; fam[4].stats2.saves = 4; fam[0].stats2.chips = 3;
    const r1 = applyDaily(save, m, { ...defaultConfig(), rival: 'tiburon' }, date);
    expect(r1.xp).toBe(r1.newlyDone.length * BONUS_XP + (r1.all ? ALL_BONUS_XP : 0));
    expect(save.daily.date).toBe(date);
    let prev = Object.values(save.characters)[0].xp;
    for (let i = 0; i < 4; i++) {
      const r = applyDaily(save, m, { ...defaultConfig(), rival: 'tiburon' }, date);
      const now = Object.values(save.characters)[0].xp;
      expect(now - prev).toBe(r.xp);                         // only what was just completed is paid
      expect(r.xp).toBe(r.newlyDone.length * BONUS_XP + (r.all ? ALL_BONUS_XP : 0));
      prev = now;
    }
    const idle = applyDaily(save, m, defaultConfig(), date);
    if (save.daily.done.every(Boolean)) expect(idle.xp).toBe(0);
    expect(defs.length).toBe(3);
  });
  it('un dia nuevo empieza de cero, la racha sube con dias seguidos y se rompe si se salta uno', () => {
    const save = defaultSave();
    const all = (date: string): void => { rollDay(save, date); save.daily.done = [true, true, true]; save.daily.progress = [9, 9, 9]; save.daily.done = [false, true, true]; };
    // day 1: finish the last one with a real match
    const finish = (date: string): void => {
      rollDay(save, date); const defs = dailyOf(date);
      save.daily.done = [true, true, false]; save.daily.progress = [defs[0].need, defs[1].need, defs[2].need - 1];
      const m = match([2, 0]); const f = m.players.filter((p) => p.team === 0);
      f[0].stats2.goals = 3; f[1].stats2.passes = 20; f[1].stats2.assists = 2; f[2].stats2.steals = 4; f[3].stats2.saves = 4; f[4].stats2.chips = 3; f[0].stats2.spGoals = 1;
      applyDaily(save, m, { ...defaultConfig(), rival: dailyOf(date)[2].id.startsWith('gana_') ? (dailyOf(date)[2].id.slice(5) as 'dragon') : 'dragon' }, date);
    };
    finish('2026-10-05'); expect(save.daily.streak).toBe(1);
    finish('2026-10-06'); expect(save.daily.streak).toBe(2);
    finish('2026-10-08'); expect(save.daily.streak).toBe(1);
    rollDay(save, '2026-10-09'); expect(save.daily.progress).toEqual([0, 0, 0]); expect(save.daily.done).toEqual([false, false, false]);
    rollDay(save, '2026-10-12'); expect(save.daily.streak).toBe(0);
    void all;
  });
  it('el guardado acepta datos viejos y sucios del desafio', () => {
    expect(sanitize({}).daily).toEqual(defaultSave().daily);
    const s = sanitize({ daily: { date: '2026-10-05xxxx', progress: [1, 'a', 3], done: [true, false], streak: -4 } });
    expect(s.daily.progress).toEqual([1, 0, 3]); expect(s.daily.done).toEqual([false, false, false]); expect(s.daily.streak).toBe(0);
    expect(today(new Date(2026, 9, 5))).toBe('2026-10-05');
    expect(POOL.length).toBeGreaterThan(10);
  });
});
