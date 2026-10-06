import { describe, expect, it } from 'vitest';
import { createMatch, step } from '../../src/core/match';
import { setHumanInput } from '../../src/core/control';
import { launchSpecial, specialChance } from '../../src/core/specials';
import { T } from '../../src/core/tuning';
import { clear, fam, give, inp, put, rival } from './helpers';
import type { Match } from '../../src/core/state';

const mkH = (controls: 'full' | 'easy', seed = 1, cine: 'full' | 'short' | 'off' = 'full'): Match => {
  const m = createMatch({ ai: 'none', skipKickoff: true, seed, cine, humans: [{ team: 0, slot: 3, humanSlot: 0, controls }] });
  for (const p of m.players) p.speedMult = 1; clear(m);
  const s = fam(m, 'sophie'); put(s, 700, 80); give(m, s); m.bar[0] = 100; step(m);
  return m;
};
/** Runs the cinematic; `press` is the time of the press of Tiro (null = never). Returns the state of the ring and the outcome at the end. */
function run(m: Match, press: number | null): { hit: string | null; outcome: string; skippedAt: number | null } {
  launchSpecial(m, fam(m, 'sophie'));
  let skippedAt: number | null = null, last = 0;
  for (let i = 0; i < 60 * 5 && m.phase === 'cinematic'; i++) {
    const t = m.special!.t;
    setHumanInput(m, 0, press !== null && t >= press && t < press + 1 / 60 + 1e-9 ? inp({ shootPressed: true }) : inp());
    last = m.special!.t; const rg = m.special!.ring;
    step(m);
    if (m.phase !== 'cinematic' && last < (rg?.end ?? 0)) skippedAt = last;
    if (rg) { /* keep a reference */ }
  }
  return { hit: null, outcome: '', skippedAt };
}

describe('mejora 4: el anillo ¡AHORA!', () => {
  it('hay anillo cuando dispara una persona, centrado cerca del contacto, con ventanas de 0,12 y 0,30 s', () => {
    const m = mkH('full'); launchSpecial(m, fam(m, 'sophie'));
    const rg = m.special!.ring!;
    expect(rg.who).toBe('atk'); expect(rg.slot).toBe(0); expect(rg.easy).toBe(false);
    expect(rg.center).toBeCloseTo(T.cinemaT.full * T.ring.centerFull, 5);
    expect(rg.perfect).toBeCloseTo(0.12, 5); expect(rg.good).toBeCloseTo(0.3, 5); expect(rg.end).toBeCloseTo(rg.center + 0.3, 5);
    expect(rg.p).toBeCloseTo(specialChance(m, fam(m, 'sophie'), fam(m, 'sophie')) * T.ring.mult, 5);
  });
  it('con controles fáciles las ventanas son 3 veces más largas', () => {
    const m = mkH('easy'); launchSpecial(m, fam(m, 'sophie'));
    const rg = m.special!.ring!;
    expect(rg.easy).toBe(true); expect(rg.perfect).toBeCloseTo(0.36, 5); expect(rg.good).toBeCloseTo(0.9, 5);
  });
  it('sin cinemáticas y IA contra IA no hay anillo', () => {
    const m = mkH('full', 1, 'off'); launchSpecial(m, fam(m, 'sophie'));
    expect(m.special!.ring).toBeUndefined();
    const a = createMatch({ ai: 'none', skipKickoff: true, seed: 1 }); for (const p of a.players) p.speedMult = 1; clear(a);
    const s = fam(a, 'sophie'); put(s, 700, 80); give(a, s); a.bar[0] = 100; step(a);
    launchSpecial(a, s);
    expect(a.special!.ring).toBeUndefined();
  });
  it('defendiendo contra un especial de la IA hay anillo sobre Thor, y no resta nada si no aprietas', () => {
    const m = createMatch({ ai: 'none', skipKickoff: true, seed: 1, firstKick: 1, humans: [{ team: 0, slot: 3, humanSlot: 0, controls: 'full' }] });
    for (const p of m.players) p.speedMult = 1; clear(m);
    const r = rival(m, 3); put(r, 300, 80); give(m, r); m.bar[1] = 100; step(m);
    launchSpecial(m, r);
    const rg = m.special!.ring!;
    expect(rg.who).toBe('def'); expect(rg.p).toBeCloseTo(specialChance(m, r, r), 5);   // the base of the AI is not reduced
  });
  it('la cinemática no se salta mientras el anillo está abierto, y sí después', () => {
    const m = mkH('full'); launchSpecial(m, fam(m, 'sophie'));
    const rg = m.special!.ring!;
    for (let i = 0; i < 60; i++) { setHumanInput(m, 0, inp({ passPressed: true })); step(m); }   // pressing Pase at 1 s does nothing: the ring ends at 1.77 s
    expect(m.phase).toBe('cinematic'); expect(rg.hit).toBeNull();
    for (let i = 0; i < 60 * 0.9; i++) { setHumanInput(m, 0, inp()); step(m); }
    expect(rg.hit).not.toBeNull();
    setHumanInput(m, 0, inp({ passPressed: true })); step(m); step(m);
    expect(m.phase).toBe('play');                                  // now a press skips it
  });
  it('perfecto, bien y fallo según cuánto se acierta al centro, y solo cuenta el primer toque', () => {
    const hitOf = (press: number | null, controls: 'full' | 'easy' = 'full'): string | null => {
      const m = mkH(controls); launchSpecial(m, fam(m, 'sophie')); const rg = m.special!.ring!;
      for (let i = 0; i < 60 * 3 && m.phase === 'cinematic'; i++) {
        const t = m.special!.t;
        setHumanInput(m, 0, press !== null && t >= press && t < press + 1 / 60 + 1e-9 ? inp({ shootPressed: true }) : inp());
        step(m);
      }
      return rg.hit;
    };
    const c = T.cinemaT.full * T.ring.centerFull;
    expect(hitOf(c)).toBe('perfect'); expect(hitOf(c + 0.08)).toBe('perfect'); expect(hitOf(c - 0.2)).toBe('good'); expect(hitOf(c + 0.25)).toBe('good');
    expect(hitOf(c + 0.45)).toBe('miss'); expect(hitOf(0.3)).toBe('miss'); expect(hitOf(null)).toBe('miss');
    expect(hitOf(null, 'easy')).toBe('good');                          // the child who does not press loses nothing
    expect(hitOf(c + 0.3, 'easy')).toBe('perfect');                    // and the window is three times as wide
  });
  it('acertar sube la probabilidad de gol: perfecto más que bien, y fallo igual a la base', () => {
    const rate = (press: number | null): number => {
      let g = 0; const N = 300;
      for (let seed = 1; seed <= N; seed++) {
        const m = mkH('full', seed); launchSpecial(m, fam(m, 'sophie'));
        for (let i = 0; i < 60 * 4 && m.phase === 'cinematic'; i++) {
          const t = m.special!.t;
          setHumanInput(m, 0, press !== null && t >= press && t < press + 1 / 60 + 1e-9 ? inp({ shootPressed: true }) : inp());
          if (m.special) { const prev = m.special; step(m); if (m.phase !== 'cinematic' && prev.outcome === 'goal') g++; } else step(m);
        }
      }
      return g / N;
    };
    const c = T.cinemaT.full * T.ring.centerFull;
    const perfect = rate(c), good = rate(c - 0.2), miss = rate(null);
    expect(perfect).toBeGreaterThan(good); expect(good).toBeGreaterThan(miss - 0.02);
    expect(perfect).toBeGreaterThan(miss + 0.12);
  });
});
void run; void rival;
