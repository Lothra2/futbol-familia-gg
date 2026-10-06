import { describe, expect, it } from 'vitest';
import { applyMatch, goldenCelebration, goldenTrail, outfitsFor, xpOf, xpToNext, XP } from '../../src/app/progress';
import { defaultSave, levelForXp, sanitize } from '../../src/save/save';
import { createMatch } from '../../src/core/match';
import { fam, mk } from './helpers';
import { playMatch } from './sim';

describe('XP, niveles y premios (B24)', () => {
  it('cada acción da su XP: partido 15, gol 10 (+5 con especial), asistencia 6, robo 2, atajada de Thor 3 y +10 a todos si se gana', () => {
    const m = mk(); const s = fam(m, 'sophie'), t = fam(m, 'thor');
    expect(xpOf(m, 'sophie', false)).toBe(XP.match);
    s.stats2.goals = 2; s.stats2.spGoals = 1; s.stats2.assists = 1; s.stats2.steals = 3;
    expect(xpOf(m, 'sophie', false)).toBe(15 + 20 + 5 + 6 + 6);
    expect(xpOf(m, 'sophie', true)).toBe(15 + 20 + 5 + 6 + 6 + 10);
    t.stats2.saves = 4; expect(xpOf(m, 'thor', false)).toBe(15 + 12);
    s.stats2.saves = 9; expect(xpOf(m, 'sophie', false)).toBe(15 + 20 + 5 + 6 + 6);   // only Thor earns from saves
  });
  it('los niveles llegan con 60, 150, 280 y 450 XP, con su premio de estilo', () => {
    expect([0, 59, 60, 149, 150, 279, 280, 449, 450, 9999].map(levelForXp)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
    expect(outfitsFor(1)).toEqual(['base']); expect(outfitsFor(2)).toEqual(['base', 'arcoiris']); expect(outfitsFor(4)).toEqual(['base', 'arcoiris', 'estrellas']);
    expect(goldenCelebration(2)).toBe(false); expect(goldenCelebration(3)).toBe(true); expect(goldenTrail(4)).toBe(false); expect(goldenTrail(5)).toBe(true);
    expect(xpToNext(0)).toEqual({ level: 1, into: 0, need: 60 }); expect(xpToNext(100)).toEqual({ level: 2, into: 40, need: 90 }); expect(xpToNext(450)).toBeNull();
  });
  it('terminar un partido suma el XP a toda la familia que jugó, sube de nivel y anota los récords', () => {
    const save = defaultSave(); const m = mk(); m.score = [4, 1];
    fam(m, 'alana').stats2.goals = 3; fam(m, 'sophie').stats2.assists = 2; fam(m, 'sophie').stats2.spGoals = 1; fam(m, 'sophie').stats2.goals = 1; fam(m, 'thor').stats2.saves = 5;
    save.characters.alana.xp = 40;
    const r = applyMatch(save, m);
    expect(r.win).toBe(true);
    const alana = r.chars.find((c) => c.id === 'alana')!;
    expect(alana.xp).toBe(15 + 30 + 10); expect(save.characters.alana.xp).toBe(95); expect(alana.levelUps).toEqual([{ level: 2, prize: 'Traje Arcoíris' }]);
    expect(save.characters.thor.xp).toBe(15 + 15 + 10); expect(save.characters.papa.xp).toBe(25);
    expect(save.records).toMatchObject({ matches: 1, goals: 4, specialGoals: 1, thorSaves: 5, biggestWin: 3 });
    expect(r.newRecords).toContain('¡Mayor goleada!');
    const again = applyMatch(save, m); expect(again.newRecords).toEqual([]); expect(save.records.matches).toBe(2);   // the same win is not a record twice
  });
  it('perder o empatar da el XP de jugar y no toca la mayor goleada', () => {
    const save = defaultSave(); const m = mk(); m.score = [1, 3];
    const r = applyMatch(save, m); expect(r.win).toBe(false); expect(save.characters.sophie.xp).toBe(15); expect(save.records.biggestWin).toBe(0);
    m.score = [2, 2]; expect(applyMatch(save, m).draw).toBe(true);
  });
  it('un equipo con Juandi lo cuenta, y el que descansa no recibe nada', () => {
    const save = defaultSave(); const m = createMatch({ ai: 'none', skipKickoff: true, squad: ['papa', 'mama', 'sophie', 'juandi'] });
    applyMatch(save, m);
    expect(save.characters.juandi.xp).toBe(15); expect(save.characters.alana.xp).toBe(0);
  });
  it('el guardado sin Juandi (de antes) se completa con su personaje', () => {
    const old = defaultSave(); delete (old.characters as any).juandi;
    expect(sanitize(old).characters.juandi).toEqual({ xp: 0, level: 1, outfit: 'base' });
  });
  it('los partidos completos dan goles contados y el XP total es coherente', () => {
    const r = playMatch({ seed: 9, halfLength: 25, difficulty: 'normales' }, 'nina5');
    const save = defaultSave(); const res = applyMatch(save, r.m);
    const goals = r.m.players.filter((p) => p.team === 0).reduce((s, p) => s + p.stats2.goals, 0);
    expect(save.records.goals).toBe(goals); expect(res.chars.length).toBe(5);
    for (const c of res.chars) expect(c.xp).toBeGreaterThanOrEqual(15);
  });
});
