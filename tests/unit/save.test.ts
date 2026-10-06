import { describe, expect, it } from 'vitest';
import { SAVE_KEY, SaveStore, defaultSave, levelForXp, sanitize, type StorageLike } from '../../src/save/save';

const mem = (init: Record<string, string> = {}): StorageLike & { d: Record<string, string> } => {
  const d = { ...init };
  return { d, getItem: (k) => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = v; } };
};

describe('guardado', () => {
  it('sin datos empieza limpio y guarda y recarga', () => {
    const st = mem(); const s = new SaveStore(() => st);
    s.load(); expect(s.status).toBe('fresh');
    s.data.records.goals = 7; s.data.characters.sophie.xp = 160; expect(s.save()).toBe(true);
    const s2 = new SaveStore(() => st); s2.load();
    expect(s2.status).toBe('ok'); expect(s2.data.records.goals).toBe(7); expect(s2.data.characters.sophie.level).toBe(3);
  });
  it('un guardado danado se respalda con fecha y el juego arranca limpio', () => {
    const st = mem({ [SAVE_KEY]: '{esto no es json' });
    const s = new SaveStore(() => st, () => Date.UTC(2026, 9, 5, 12, 30, 0)); s.load();
    expect(s.status).toBe('recovered');
    expect(st.d[`${SAVE_KEY}.bak-2026-10-05-12-30-00`]).toBe('{esto no es json');
    expect(s.data).toEqual(defaultSave());
  });
  it('almacenamiento bloqueado: juega en memoria y lo avisa con el estado', () => {
    const s = new SaveStore(() => { throw new Error('blocked'); }); s.load();
    expect(s.status).toBe('memory'); expect(s.save()).toBe(false); expect(s.persistent).toBe(false);
  });
  it('un guardado a medias se rellena y se recorta a rangos validos', () => {
    const s = sanitize({ settings: { music: 9, halfLength: 77, controls: ['easy', 'raro'], difficulty: 'campeones' }, characters: { alana: { xp: 99999, outfit: 'estrellas' } }, cup: { stage: 3 } });
    expect(s.settings.music).toBe(1); expect(s.settings.halfLength).toBe(90); expect(s.settings.controls).toEqual(['easy', 'full']);
    expect(s.settings.difficulty).toBe('campeones'); expect(s.characters.alana.level).toBe(5); expect(s.characters.alana.outfit).toBe('estrellas');
    expect(s.characters.sophie.xp).toBe(0); expect(s.cup.stage).toBe(3);
  });
  it('un traje bloqueado no se puede tener puesto', () => {
    expect(sanitize({ characters: { papa: { xp: 10, outfit: 'estrellas' } } }).characters.papa.outfit).toBe('base');
  });
  it('niveles segun GAME_DESIGN: 60, 150, 280, 450', () => {
    expect([0, 59, 60, 149, 150, 279, 280, 449, 450].map(levelForXp)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5]);
  });
});
