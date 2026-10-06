import { describe, expect, it } from 'vitest';
import { cupInProgress, cupKingdom, cupMatchResult, cupWon, startCup } from '../../src/app/cup';
import { defaultSave } from '../../src/save/save';
import { mk } from './helpers';

describe('La Copa de los Cuatro Reinos', () => {
  it('empieza en el Bosque y el orden es Bosque, Arrecife, Nubes y Volcán', () => {
    const s = defaultSave(); startCup(s, 'tranquilos');
    expect(s.cup).toEqual({ active: true, stage: 0, difficulty: 'tranquilos' });
    const order: string[] = [];
    for (let i = 0; i < 4; i++) { order.push(cupKingdom(s).id); const m = mk(); m.score = [2, 0]; cupMatchResult(s, m); }
    expect(order).toEqual(['bosque', 'arrecife', 'nubes', 'volcan']);
  });
  it('ganar da la copa del reino y avanza; perder repite el mismo partido sin límite', () => {
    const s = defaultSave(); startCup(s, 'normales');
    const lose = mk(); lose.score = [0, 1];
    for (let i = 0; i < 5; i++) { const r = cupMatchResult(s, lose); expect(r.kind).toBe('rematch'); expect(s.cup.stage).toBe(0); expect(s.trophies.bosque).toBe(false); }
    const win = mk(); win.score = [3, 1]; const r = cupMatchResult(s, win);
    expect(r.kind).toBe('advance'); expect(r.trophy).toBe('bosque'); expect(r.next!.id).toBe('arrecife'); expect(s.trophies.bosque).toBe(true); expect(s.cup.stage).toBe(1);
  });
  it('un empate se resuelve en los penales: gana quien los gane', () => {
    const m = mk(); m.score = [1, 1];
    m.penWinner = 0; expect(cupWon(m)).toBe(true); m.penWinner = 1; expect(cupWon(m)).toBe(false); m.penWinner = null; expect(cupWon(m)).toBe(false);
  });
  it('ganar la final da la copa grande, cierra la Copa y se puede empezar otra', () => {
    const s = defaultSave(); startCup(s, 'campeones'); const w = mk(); w.score = [1, 0];
    let last = cupMatchResult(s, w); expect(cupInProgress(s)).toBe(true);
    for (let i = 0; i < 3; i++) last = cupMatchResult(s, w);
    expect(last.kind).toBe('champion'); expect(s.trophies).toMatchObject({ bosque: true, arrecife: true, nubes: true, volcan: true, copa: 1 });
    expect(s.cup.active).toBe(false); expect(s.cup.stage).toBe(4); expect(cupInProgress(s)).toBe(false);
    startCup(s, 'normales'); expect(s.cup.stage).toBe(0); expect(s.trophies.copa).toBe(1);   // the cups already won stay
  });
  it('una Copa a medias se puede continuar: guarda la etapa y la dificultad', () => {
    const s = defaultSave(); startCup(s, 'campeones'); const w = mk(); w.score = [2, 1]; cupMatchResult(s, w); cupMatchResult(s, w);
    expect(cupInProgress(s)).toBe(true); expect(cupKingdom(s).id).toBe('nubes'); expect(s.cup.difficulty).toBe('campeones');
  });
});
