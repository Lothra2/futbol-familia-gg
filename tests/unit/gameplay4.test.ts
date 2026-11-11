import { MID } from '../../src/core/field';
import { describe, expect, it } from 'vitest';
import { createMatch, step } from '../../src/core/match';
import { setHumanInput } from '../../src/core/control';
import { chargeZone, launchSpecial, specialChance } from '../../src/core/specials';
import { T } from '../../src/core/tuning';
import { clear, fam, give, inp, put, rival } from './helpers';
import type { Match } from '../../src/core/state';

const mkH = (controls: 'full' | 'easy', seed = 1): Match => {
  const m = createMatch({ ai: 'none', skipKickoff: true, seed, humans: [{ team: 0, slot: 4, humanSlot: 0, controls }] });
  for (const p of m.players) p.speedMult = 1; clear(m);
  const s = fam(m, 'sophie'); put(s, 700, MID); give(m, s); m.bar[0] = 100; step(m);
  return m;
};
/** Loads the special of Sophie and lets it go with `btn` when the bar is at `u` (0 to 1; null = never). Returns how it went and the result. */
function load(m: Match, u: number | null, btn: 'shootPressed' | 'specialPressed' | 'passPressed' = 'shootPressed'): { hit: number; outcome: string; t: number } {
  launchSpecial(m, fam(m, 'sophie'));
  const t0 = m.t; let hit = -1, done = false;
  for (let i = 0; i < 60 * 3 && m.special; i++) {
    const sp = m.special, now = !done && u !== null && sp.t + 1 / 60 >= u * sp.dur;
    if (now) done = true;
    setHumanInput(m, 0, now ? inp({ [btn]: true }) : inp());
    step(m);
    for (const e of m.events) if (e.k === 'chargehit') hit = e.v ?? -1;
    m.events = [];
  }
  return { hit, outcome: m.flight ? m.flight.outcome : '', t: m.t - t0 };
}
const MIDDLE = (T.charge.perfect[0] + T.charge.perfect[1]) / 2;

describe('la barra de carga del especial (Nekketsu: sin película)', () => {
  it('la barra es de quien lo pidió, con su zona verde y la amarilla dentro, y arranca con la base rebajada', () => {
    const m = mkH('full'); launchSpecial(m, fam(m, 'sophie'));
    const ch = m.special!.charge;
    expect(ch.slot).toBe(0); expect(ch.easy).toBe(false); expect(ch.hit).toBeNull();
    expect(ch.good).toEqual([...T.charge.good]); expect(ch.perfect).toEqual([...T.charge.perfect]);
    expect(ch.good[0]).toBeLessThan(ch.perfect[0]); expect(ch.perfect[1]).toBeLessThan(ch.good[1]);
    expect(ch.p).toBeCloseTo(specialChance(m, fam(m, 'sophie'), fam(m, 'sophie')) * T.charge.mult, 5);
    expect(m.special!.dur).toBe(T.charge.dur);
  });
  it('con controles fáciles las zonas son el doble de anchas', () => {
    const m = mkH('easy'); launchSpecial(m, fam(m, 'sophie'));
    const ch = m.special!.charge, w = (z: readonly number[]): number => z[1] - z[0];
    expect(ch.easy).toBe(true); expect(w(ch.perfect)).toBeCloseTo(w(T.charge.perfect) * 2, 5); expect(w(ch.good)).toBeGreaterThan(w(T.charge.good) * 1.3);
  });
  it('IA contra IA no hay barra que soltar: carga la mitad de tiempo y su probabilidad no se rebaja', () => {
    const m = createMatch({ ai: 'none', skipKickoff: true, seed: 1, firstKick: 1 });
    for (const p of m.players) p.speedMult = 1; clear(m);
    const r = rival(m, 3); put(r, 300, MID); give(m, r); m.bar[1] = 100; step(m);
    launchSpecial(m, r);
    expect(m.special!.charge.slot).toBeNull(); expect(m.special!.charge.def).toBe(false); expect(m.special!.dur).toBe(T.charge.aiDur);
    expect(m.special!.charge.p).toBeCloseTo(specialChance(m, r, r), 5);
  });
  /** A rival loads his special against a family with a person, who presses Tiro when his bar is at `u` (null: never). */
  const defend = (u: number | null, seed = 1, controls: 'full' | 'easy' = 'full'): { hit: number; outcome: string; t: number; m: Match } => {
    const m = createMatch({ ai: 'none', skipKickoff: true, seed, firstKick: 1, humans: [{ team: 0, slot: 4, humanSlot: 0, controls }] });
    for (const p of m.players) p.speedMult = 1; clear(m);
    const r = rival(m, 3); put(r, 300, MID); give(m, r); m.bar[1] = 100; step(m);
    launchSpecial(m, r);
    const t0 = m.t; let hit = -1, done = false;
    for (let i = 0; i < 60 * 3 && m.special; i++) {
      const sp = m.special, now = !done && u !== null && sp.t + 1 / 60 >= u * sp.dur;
      if (now) done = true;
      setHumanInput(m, 0, now ? inp({ shootPressed: true }) : inp());
      step(m);
      for (const e of m.events) if (e.k === 'chargedef') hit = e.v ?? -1;
      m.events = [];
    }
    return { hit, outcome: m.flight ? m.flight.outcome : '', t: m.t - t0, m };
  };
  it('contra el especial de un rival la barra es de quien defiende: Tiro a tiempo ayuda a su portero, y el rival dispara igual al llenarse', () => {
    const m = createMatch({ ai: 'none', skipKickoff: true, seed: 1, firstKick: 1, humans: [{ team: 0, slot: 4, humanSlot: 0, controls: 'full' }] });
    for (const p of m.players) p.speedMult = 1; clear(m);
    const r = rival(m, 3); put(r, 300, MID); give(m, r); m.bar[1] = 100; step(m);
    launchSpecial(m, r);
    const ch = m.special!.charge;
    expect(ch.def).toBe(true); expect(ch.slot).toBe(0); expect(m.special!.dur).toBe(T.charge.defDur);
    expect(ch.p).toBeCloseTo(specialChance(m, r, r), 5);   // the base of the AI is not reduced: not pressing takes nothing away
    const a = defend(MIDDLE); expect(a.hit).toBe(2); expect(a.t).toBeCloseTo(T.charge.defDur, 1);   // pressing does not make the rival shoot sooner
    expect(defend(T.charge.good[0] + 0.05).hit).toBe(1); expect(defend(0.3).hit).toBe(0); expect(defend(null).hit).toBe(0);
    expect(defend(null, 1, 'easy').hit).toBe(1);   // the child gets the help without pressing
  });
  it('taparlo a tiempo baja los goles del especial rival', () => {
    const rate = (u: number | null): number => { let g = 0; for (let seed = 1; seed <= 400; seed++) if (defend(u, seed).outcome === 'goal') g++; return g / 400; };
    const perfect = rate(MIDDLE), none = rate(null);
    expect(perfect).toBeLessThan(none - 0.07);
  });
  it('chargeZone: amarillo es perfecto, verde es bien, antes es pronto', () => {
    const z = { good: [0.5, 0.96] as [number, number], perfect: [0.66, 0.84] as [number, number] };
    expect(chargeZone(z, 0.75)).toBe('perfect'); expect(chargeZone(z, 0.66)).toBe('perfect'); expect(chargeZone(z, 0.55)).toBe('good');
    expect(chargeZone(z, 0.9)).toBe('good'); expect(chargeZone(z, 0.3)).toBe('early'); expect(chargeZone(z, 0.99)).toBe('early');
  });
  it('soltar con Tiro o con Especial dispara al instante; Pase no hace nada; el mismo toque que lo pidió no cuenta', () => {
    const a = load(mkH('full'), MIDDLE); expect(a.hit).toBe(2); expect(a.t).toBeLessThan(T.charge.dur * T.charge.perfect[1] + 0.05);
    const b = load(mkH('full'), MIDDLE, 'specialPressed'); expect(b.hit).toBe(2);
    const c = load(mkH('full'), MIDDLE, 'passPressed'); expect(c.hit).toBe(0); expect(c.t).toBeCloseTo(T.charge.dur, 1);
    // the press that asked for the special is still down in the first steps: it must not let the bar go
    const m = mkH('full'); setHumanInput(m, 0, inp({ specialPressed: true })); step(m);
    expect(m.special).not.toBeNull(); step(m); step(m); expect(m.special).not.toBeNull(); expect(m.special!.charge.hit).toBeNull();
  });
  it('perfecto, bien y pronto según dónde está la aguja, y quien no aprieta se queda con la base', () => {
    expect(load(mkH('full'), MIDDLE).hit).toBe(2);
    expect(load(mkH('full'), T.charge.good[0] + 0.05).hit).toBe(1);
    expect(load(mkH('full'), T.charge.perfect[1] + 0.07).hit).toBe(1);
    expect(load(mkH('full'), 0.3).hit).toBe(0);
    expect(load(mkH('full'), null).hit).toBe(0);
    expect(load(mkH('easy'), null).hit).toBe(1);                         // the child who does not press loses nothing
    expect(load(mkH('easy'), T.charge.perfect[0] - 0.06).hit).toBe(2);   // and the yellow is twice as wide
  });
  it('acertar sube la probabilidad de gol: perfecto más que bien, y bien más que no soltarla', () => {
    const rate = (u: number | null): number => {
      let g = 0; const N = 300;
      for (let seed = 1; seed <= N; seed++) if (load(mkH('full', seed), u).outcome === 'goal') g++;
      return g / N;
    };
    const perfect = rate(MIDDLE), good = rate(T.charge.good[0] + 0.05), none = rate(null);
    expect(perfect).toBeGreaterThan(good + 0.04); expect(good).toBeGreaterThan(none + 0.02);
    expect(perfect).toBeGreaterThan(none + 0.12);
  });
});
