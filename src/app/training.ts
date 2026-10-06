import type { Match } from '../core/state';
import { startTrainingFreeKick } from '../core/freekick';
import { endPenaltyPractice, startPenaltyPractice } from '../core/penalties';

export interface Challenge { id: string; title: string; hint: string; need: number; read: (m: Match) => number; needsFull?: boolean; /** Called at every update while this challenge is the one on (the free kick puts the ball in place). */ tick?: (m: Match) => void }
const fam = (m: Match) => m.players.filter((p) => p.team === 0 && p.role !== 'gk');
const sum = (m: Match, f: (s: Match['players'][number]['stats2']) => number): number => fam(m).reduce((a, p) => a + f(p.stats2), 0);

/** The practice with Thor, in order. Every number counts what the family does from the moment each challenge starts. */
export const CHALLENGES: Challenge[] = [
  { id: 'pases', title: 'Pasa el balón 5 veces', hint: 'Toca Pase para un pase raso a un compañero', need: 5, read: (m) => sum(m, (s) => s.passes) },
  { id: 'alto', title: 'Haz 2 pases altos', hint: 'Mantén Pase un momento y suéltalo: el balón vuela por arriba', need: 2, read: (m) => sum(m, (s) => s.chips), needsFull: true },
  { id: 'goles', title: 'Marca 3 goles', hint: 'Mantén Tiro para más potencia y suéltalo cerca del arco', need: 3, read: (m) => sum(m, (s) => s.goals) },
  { id: 'poder', title: 'Marca un gol con tu poder', hint: 'Acércate al arco con el balón y toca Especial', need: 1, read: (m) => sum(m, (s) => s.spGoals) },
  { id: 'libre', title: 'Mete un tiro libre', hint: 'Apunta con el stick, toca Tiro y otra vez Tiro cuando el medidor esté en verde. Sin prisa', need: 1, read: (m) => (m.data.fkGoals as number) ?? 0,
    tick: (m) => { if (((m.phase === 'play' && !m.restart) || m.phase === 'kickoff') && m.t - ((m.data.fkAt as number) ?? -99) > 4) startTrainingFreeKick(m); } },
  { id: 'penales', title: 'Mete 2 penales', hint: 'Mueve el stick a los lados para apuntar y arriba o abajo para la altura. Toca Tiro para patear', need: 2, read: (m) => (m.data.penGoals as number) ?? 0,
    tick: (m) => { if (((m.phase === 'play' && !m.restart) || m.phase === 'kickoff') && !m.pen) startPenaltyPractice(m); } },
];

/** The drills of the menu: only free kicks or only penalties, repeated until the person leaves (a set of 3 is a "reto superado" and the next set starts). */
const DRILLS: Record<string, Challenge[]> = {
  libre: [{ ...CHALLENGES.find((c) => c.id === 'libre')!, title: 'Mete 3 tiros libres', need: 3 }],
  penal: [{ ...CHALLENGES.find((c) => c.id === 'penales')!, title: 'Mete 3 penales', need: 3 }],
};

export interface TrainingView { index: number; total: number; title: string; hint: string; have: number; need: number; justDone: boolean; allDone: boolean }

/** State of the practice: which challenge is on and how far along it is. Pure, so it is tested without a browser. */
export class Training {
  private list: Challenge[];
  index = 0; private base = 0; done = false;
  private loop: boolean;
  /** The last penalty of the challenge went in: the practice ends when its celebration is over. */
  private endPen = false;
  constructor(m: Match, private easy = false, drill: 'todo' | 'libre' | 'penal' = 'todo') {
    this.loop = drill !== 'todo';
    this.list = (DRILLS[drill] ?? CHALLENGES).filter((c) => !(easy && c.needsFull));
    this.base = this.list[0].read(m);
  }
  get total(): number { return this.list.length; }
  update(m: Match): TrainingView {
    const c = this.list[Math.min(this.index, this.list.length - 1)];
    if (this.endPen && m.pen?.practice && (m.pen.step !== 'result' || m.pen.t >= 1.6)) { this.endPen = false; endPenaltyPractice(m); }
    if (!this.done && !this.endPen) c.tick?.(m);
    let have = this.done ? c.need : Math.min(c.need, c.read(m) - this.base), justDone = false;
    if (!this.done && have >= c.need) {
      justDone = true; this.index++;
      if (m.pen?.practice && !this.loop) this.endPen = true;
      if (this.index >= this.list.length) { if (this.loop) { this.index = 0; this.base = this.list[0].read(m); } else this.done = true; } else this.base = this.list[this.index].read(m);
    }
    const cur = this.list[Math.min(this.index, this.list.length - 1)];
    if (justDone && !this.done) have = 0;
    return { index: Math.min(this.index, this.list.length - 1), total: this.list.length, title: this.done ? '¡Entrenamiento completo!' : cur.title, hint: this.done ? '' : this.loop ? `${cur.hint} · Llevas ${cur.read(m)} en total` : cur.hint, have: this.done ? cur.need : have, need: cur.need, justDone, allDone: this.done };
  }
}
