import { describe, expect, it } from 'vitest';
import { DEFAULT_SQUAD, FIELD_CHARS, roster, squadSeats } from '../../src/core/teams';
import { createMatch } from '../../src/core/match';
import { KIND_INDEX, specialKind } from '../../src/core/specials';
import { JERSEY } from '../../src/core/types';
import { FAMILY } from '../../src/core/tuning';
import { cleanSquad, MatchController, defaultConfig } from '../../src/app/controller';
import { playMatch } from './sim';
import { fam } from './helpers';

describe('equipo de campo con Juandi (#21)', () => {
  it('con el equipo de siempre los asientos no cambian: Papá y Mamá atrás, Sophie y Alana adelante', () => {
    expect(squadSeats(DEFAULT_SQUAD)).toEqual({ papa: 1, mama: 2, sophie: 3, alana: 4 });
    const r = roster('family');
    expect(r.map((s) => [s.slot, s.role, s.charId])).toEqual([[0, 'gk', 'thor'], [1, 'def', 'papa'], [2, 'def', 'mama'], [3, 'fwd', 'sophie'], [4, 'fwd', 'alana']]);
  });
  it('cada una de las 5 combinaciones llena los 5 asientos con 4 personajes distintos y Thor de portero', () => {
    for (const rest of FIELD_CHARS) {
      const squad = FIELD_CHARS.filter((c) => c !== rest);
      const r = roster('family', squad);
      expect(r.map((s) => s.slot)).toEqual([0, 1, 2, 3, 4]);
      expect(new Set(r.map((s) => s.charId)).size).toBe(5);
      expect(r.some((s) => s.charId === rest)).toBe(false);
      expect(r[0].charId).toBe('thor');
      expect(r.filter((s) => s.role === 'def').length).toBe(2);
    }
  });
  it('Papá y Mamá defienden primero: Juandi es delantero si descansa Sophie o Alana y defensa si descansa Papá o Mamá', () => {
    const role = (rest: string) => roster('family', FIELD_CHARS.filter((c) => c !== rest)).find((s) => s.charId === 'juandi')!.role;
    expect(role('sophie')).toBe('fwd'); expect(role('alana')).toBe('fwd'); expect(role('papa')).toBe('def'); expect(role('mama')).toBe('def');
  });
  it('Juandi trae sus números y su tiro especial propio, con la camiseta 21', () => {
    const m = createMatch({ squad: ['papa', 'mama', 'sophie', 'juandi'], ai: 'none', skipKickoff: true });
    const j = fam(m, 'juandi');
    expect(j.name).toBe('Juandi'); expect(j.stats.run).toBe(FAMILY.juandi.run);
    expect(JERSEY.juandi).toBe(21);
    expect(specialKind(j)).toBe('relampago'); expect(KIND_INDEX.indexOf('relampago')).toBe(9);
    expect(m.players.filter((p) => p.team === 0).length).toBe(5);
  });
  it('un equipo mal armado cae al de siempre', () => {
    expect(cleanSquad(['papa', 'papa', 'mama', 'sophie'])).toEqual(DEFAULT_SQUAD);
    expect(cleanSquad(['papa', 'mama', 'sophie', 'juandi'])).toEqual(['papa', 'mama', 'sophie', 'juandi']);
    expect(cleanSquad(undefined)).toEqual(DEFAULT_SQUAD);
  });
  it('el controlador sienta al humano en un personaje que sí juega', () => {
    const cfg = { ...defaultConfig(), squad: ['papa', 'mama', 'juandi', 'alana'] as never, chars: ['sophie', 'alana'] as never, players: 2 as const };
    const c = new MatchController(cfg, null);
    const names = c.m.humans.map((h) => c.m.players.find((p) => p.id === h.id)!.charId);
    expect(names).toEqual(['alana', 'juandi']);
  });
  it('un partido entero con Juandi en cancha termina sin trabas ni NaN', () => {
    for (const rest of ['papa', 'mama', 'sophie', 'alana'] as const) {
      const r = playMatch({ seed: 5, halfLength: 20, difficulty: 'normales', squad: FIELD_CHARS.filter((c) => c !== rest) as never }, 'nina5');
      expect(r.m.phase, rest).toBe('over'); expect(r.nan).toBe(false); expect(r.stuck, rest).toBe(0);
    }
  });
});
