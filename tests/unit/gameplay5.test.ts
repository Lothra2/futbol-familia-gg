import { describe, expect, it } from 'vitest';
import { createMatch } from '../../src/core/match';
import { aiParams } from '../../src/core/ai/difficulty';
import { specialChance } from '../../src/core/specials';
import { ARC, STYLE, T } from '../../src/core/tuning';
import { KINGDOMS } from '../../src/data/kingdoms';
import { fam, rival } from './helpers';
import type { Species } from '../../src/core/types';

const SP: Species[] = ['mapache', 'tiburon', 'buho', 'dragon'];
const mk = (species: Species, arc = 0) => createMatch({ ai: 'none', skipKickoff: true, seed: 1, away: species, arc });

describe('mejora 5: cada reino juega distinto', () => {
  it('cada reino tiene su estilo y su consejo antes del partido', () => {
    for (const k of KINGDOMS) { expect(STYLE[k.species]).toBeDefined(); expect(k.style.length).toBeGreaterThan(10); }
    expect(new Set(KINGDOMS.map((k) => k.style)).size).toBe(4);
  });
  it('los parámetros de la IA de un rival siguen el estilo de su especie', () => {
    const par = (sp: Species, arc = 0) => aiParams(mk(sp, arc), rival(mk(sp, arc), 3));
    const dragon = par('dragon'), mapache = par('mapache'), buho = par('buho'), tiburon = par('tiburon');
    expect(dragon.shootRange).toBeGreaterThan(mapache.shootRange * 1.3);                // the dragons shoot from afar
    expect(buho.passBias).toBeGreaterThan(2); expect(buho.crossBias).toBeGreaterThan(2);
    expect(tiburon.counter).toBeGreaterThan(0); expect(tiburon.passBias).toBeLessThan(1);
    expect(mapache.counter).toBe(0);
  });
  it('los rivales corren según el estilo y la fecha de la Copa', () => {
    const speed = (sp: Species, arc: number): number => rival(mk(sp, arc), 3).speedMult;
    expect(speed('tiburon', 0)).toBeGreaterThan(speed('mapache', 0));                   // the sharks are faster
    expect(speed('mapache', 3)).toBeCloseTo(speed('mapache', 0) * ARC.speed[3], 5);     // the last date is faster than the first
    for (let i = 1; i < 4; i++) expect(ARC.speed[i]).toBeGreaterThan(ARC.speed[i - 1]);
  });
  it('los compañeros de la familia y el portero no cambian con el estilo ni la fecha', () => {
    const a = mk('dragon', 0), b = mk('dragon', 3);
    expect(fam(a, 'mama').speedMult).toBe(fam(b, 'mama').speedMult);
    const gk = (m: ReturnType<typeof mk>) => m.players.find((p) => p.team === 1 && p.role === 'gk')!;
    expect(gk(a).stats.steal).toBeUndefined();
  });
  it('la reacción baja con la fecha de la Copa y nunca pasa de 0,08 s', () => {
    const r0 = aiParams(mk('dragon', 0), rival(mk('dragon', 0), 3)).reaction, r3 = aiParams(mk('dragon', 3), rival(mk('dragon', 3), 3)).reaction;
    expect(r3).toBeCloseTo(r0 - ARC.react[3], 5); expect(r3).toBeGreaterThanOrEqual(0.08);
  });
  it('con controles fáciles los estilos se sienten a la mitad', () => {
    const m = createMatch({ ai: 'none', skipKickoff: true, seed: 1, away: 'buho', humans: [{ team: 0, slot: 3, humanSlot: 0, controls: 'easy' }] });
    const easy = aiParams(m, rival(m, 3)), full = aiParams(mk('buho'), rival(mk('buho'), 3));
    expect(easy.passBias - 1).toBeCloseTo((full.passBias - 1) / 2, 5);
  });
  it('el especial de los Dragoncitos es el más temido', () => {
    const p = (sp: Species): number => { const m = mk(sp); const r = rival(m, 3); return specialChance(m, r, r); };
    expect(p('dragon')).toBeGreaterThan(p('mapache') - 1e-9);
    expect(T.special.cap).toBeGreaterThan(p('dragon'));
  });
  it('los Mapachitos roban más de frente (multiplicador de robo)', () => {
    expect(rival(mk('mapache'), 3).stats.steal).toBeGreaterThan(1); expect(rival(mk('buho'), 3).stats.steal).toBe(1);
    expect(rival(mk('dragon'), 3).stats.resist).toBeGreaterThan(rival(mk('buho'), 3).stats.resist);
  });
  it('los 4 reinos son los de STYLE', () => { expect(SP.sort()).toEqual(Object.keys(STYLE).sort()); });
});
