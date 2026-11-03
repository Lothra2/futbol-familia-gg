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
  it('con el equipo de siempre (2-1-2): Papá y Mamá atrás, Juandi al medio, Sophie y Alana adelante, Thor al arco', () => {
    expect(squadSeats(DEFAULT_SQUAD)).toEqual({ papa: 1, mama: 2, juandi: 3, sophie: 4, alana: 5 });
    const r = roster('family');
    expect(r.map((s) => [s.slot, s.role, s.charId])).toEqual([[0, 'gk', 'thor'], [1, 'def', 'papa'], [2, 'def', 'mama'], [3, 'mid', 'juandi'], [4, 'fwd', 'sophie'], [5, 'fwd', 'alana']]);
  });
  it('6 contra 6: los cinco juegan siempre, el orden del equipo decide el puesto y Thor es el portero', () => {
    for (const first of FIELD_CHARS) {
      const r = roster('family', [first]);
      expect(r.map((s) => s.slot)).toEqual([0, 1, 2, 3, 4, 5]);
      expect(new Set(r.map((s) => s.charId)).size).toBe(6);
      expect(r[0].charId).toBe('thor'); expect(r[1].charId).toBe(first);
      expect(r.filter((s) => s.role === 'def').length).toBe(2);
    }
  });
  it('la formación cambia los puestos: 1-2-2 tiene un defensa, 2-2-1 un delantero', () => {
    const roles = (f: '1-2-2' | '2-2-1') => roster('family', DEFAULT_SQUAD, f).map((s) => s.role);
    expect(roles('1-2-2')).toEqual(['gk', 'def', 'mid', 'mid', 'fwd', 'fwd']);
    expect(roles('2-2-1')).toEqual(['gk', 'def', 'def', 'mid', 'mid', 'fwd']);
  });
  it('Juandi trae sus números y su tiro especial propio, con la camiseta 21', () => {
    const m = createMatch({ ai: 'none', skipKickoff: true });
    const j = fam(m, 'juandi');
    expect(j.name).toBe('Juandi'); expect(j.stats.run).toBe(FAMILY.juandi.run);
    expect(JERSEY.juandi).toBe(21);
    expect(specialKind(j)).toBe('relampago'); expect(KIND_INDEX.indexOf('relampago')).toBe(9);
    expect(m.players.filter((p) => p.team === 0).length).toBe(6); expect(m.players.filter((p) => p.team === 1).length).toBe(6);
  });
  it('un equipo mal armado cae al de siempre', () => {
    expect(cleanSquad(['papa', 'papa', 'mama', 'sophie'])).toEqual(DEFAULT_SQUAD);
    expect(cleanSquad(['papa', 'mama', 'sophie', 'juandi'])).toEqual(['papa', 'mama', 'sophie', 'juandi', 'alana']);
    expect(cleanSquad(undefined)).toEqual(DEFAULT_SQUAD);
  });
  it('el controlador sienta al humano en un personaje que sí juega', () => {
    const cfg = { ...defaultConfig(), chars: ['sophie', 'sophie'] as never, players: 2 as const };
    const c = new MatchController(cfg, null);
    const names = c.m.humans.map((h) => c.m.players.find((p) => p.id === h.id)!.charId);
    expect(names).toEqual(['sophie', 'alana']);   // two people cannot share Sophie: the second gets the next free one
  });
  it('un partido entero con Juandi en cancha termina sin trabas ni NaN', () => {
    for (const rest of ['papa', 'mama', 'sophie', 'alana'] as const) {
      const r = playMatch({ seed: 5, halfLength: 20, difficulty: 'normales', squad: [rest, ...FIELD_CHARS.filter((c) => c !== rest)] as never }, 'nina5');
      expect(r.m.phase, rest).toBe('over'); expect(r.nan).toBe(false); expect(r.stuck, rest).toBe(0);
    }
  });
});
