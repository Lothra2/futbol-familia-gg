import type { Match } from '../core/state';

export interface Challenge { id: string; title: string; hint: string; need: number; read: (m: Match) => number; needsFull?: boolean }
const fam = (m: Match) => m.players.filter((p) => p.team === 0 && p.role !== 'gk');
const sum = (m: Match, f: (s: Match['players'][number]['stats2']) => number): number => fam(m).reduce((a, p) => a + f(p.stats2), 0);

/** The practice with Thor, in order. Every number counts what the family does from the moment each challenge starts. */
export const CHALLENGES: Challenge[] = [
  { id: 'pases', title: 'Pasa el balón 5 veces', hint: 'Toca Pase para un pase raso a un compañero', need: 5, read: (m) => sum(m, (s) => s.passes) },
  { id: 'alto', title: 'Haz 2 pases altos', hint: 'Mantén Pase un momento y suéltalo: el balón vuela por arriba', need: 2, read: (m) => sum(m, (s) => s.chips), needsFull: true },
  { id: 'goles', title: 'Marca 3 goles', hint: 'Mantén Tiro para más potencia y suéltalo cerca del arco', need: 3, read: (m) => sum(m, (s) => s.goals) },
  { id: 'poder', title: 'Marca un gol con tu poder', hint: 'Acércate al arco con el balón y toca Especial', need: 1, read: (m) => sum(m, (s) => s.spGoals) },
];

export interface TrainingView { index: number; total: number; title: string; hint: string; have: number; need: number; justDone: boolean; allDone: boolean }

/** State of the practice: which challenge is on and how far along it is. Pure, so it is tested without a browser. */
export class Training {
  private list: Challenge[];
  index = 0; private base = 0; done = false;
  constructor(m: Match, private easy = false) {
    this.list = CHALLENGES.filter((c) => !(easy && c.needsFull));
    this.base = this.list[0].read(m);
  }
  get total(): number { return this.list.length; }
  update(m: Match): TrainingView {
    const c = this.list[Math.min(this.index, this.list.length - 1)];
    let have = this.done ? c.need : Math.min(c.need, c.read(m) - this.base), justDone = false;
    if (!this.done && have >= c.need) {
      justDone = true; this.index++;
      if (this.index >= this.list.length) this.done = true; else this.base = this.list[this.index].read(m);
    }
    const cur = this.list[Math.min(this.index, this.list.length - 1)];
    if (justDone && !this.done) have = 0;
    return { index: Math.min(this.index, this.list.length - 1), total: this.list.length, title: this.done ? '¡Entrenamiento completo!' : cur.title, hint: this.done ? '' : cur.hint, have: this.done ? cur.need : have, need: cur.need, justDone, allDone: this.done };
  }
}
