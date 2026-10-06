import type { TrainingView } from '../app/training';

/** The card of the practice: which challenge is on, how far along, and the hint. */
export class TrainingPanel {
  private el: HTMLElement;
  private last = '';
  constructor() {
    this.el = document.createElement('div'); this.el.id = 'training';
    this.el.innerHTML = `<div class="tt"><b id="tn"></b><span id="tc"></span></div><div class="tbar"><i id="tb"></i></div><div class="th" id="th"></div>`;
    document.getElementById('ui')!.appendChild(this.el);
  }
  update(v: TrainingView): void {
    const key = `${v.index}|${v.have}|${v.allDone}`;
    if (key === this.last) return; this.last = key;
    (this.el.querySelector('#tn') as HTMLElement).textContent = `Reto ${v.index + 1}/${v.total}: ${v.title}`;
    (this.el.querySelector('#tc') as HTMLElement).textContent = v.allDone ? '★' : `${v.have}/${v.need}`;
    (this.el.querySelector('#tb') as HTMLElement).style.width = `${Math.round((v.have / v.need) * 100)}%`;
    (this.el.querySelector('#th') as HTMLElement).textContent = v.hint;
    this.el.classList.toggle('done', v.allDone);
  }
  destroy(): void { this.el.remove(); }
}

/** The end of the practice. */
export function showTrainingDone(onKeep: () => void, onMenu: () => void): HTMLElement {
  const box = document.createElement('div'); box.className = 'screen dim'; box.id = 'result';
  box.innerHTML = `<div class="panel"><h2>¡Entrenamiento completo!</h2><p class="msg">Thor está orgulloso de ustedes.</p><p>Ya dominan el pase, el pase alto, el tiro y el poder.</p><div class="row"><button class="btn big primary" id="keep" data-focus>Seguir practicando</button><button class="btn big" id="tomenu">Menú</button></div></div>`;
  box.querySelector('#keep')!.addEventListener('click', () => { box.remove(); onKeep(); });
  box.querySelector('#tomenu')!.addEventListener('click', onMenu);
  document.getElementById('ui')!.appendChild(box);
  return box;
}
