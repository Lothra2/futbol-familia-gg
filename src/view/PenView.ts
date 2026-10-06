import Phaser from 'phaser';
import type { Match } from '../core/state';

const font = (px: number, color = '#ffffff'): Phaser.Types.GameObjects.Text.TextStyle => ({ fontFamily: 'Pixelify, sans-serif', fontSize: `${px}px`, fontStyle: 'bold', color, stroke: '#2A1B3D', strokeThickness: Math.max(3, Math.round(px / 6)) });
const TXT: Record<string, [string, string]> = { goal: ['¡GOOOOL!', '#ffe45c'], saved: ['¡ATAJADA!', '#7be3ff'], miss: ['¡AFUERA!', '#ffb4b4'], post: ['¡POSTE!', '#ffe9a8'] };

/** The shootout on top of the pitch: the dots of every kick, and the word of each result (reads `m.pen`, never changes it). */
export class PenView {
  private g: Phaser.GameObjects.Graphics;
  private title: Phaser.GameObjects.Text;
  private word: Phaser.GameObjects.Text;
  private who: Phaser.GameObjects.Text;
  private names: [Phaser.GameObjects.Text, Phaser.GameObjects.Text];

  constructor(scene: Phaser.Scene, private teams: [string, string]) {
    this.g = scene.add.graphics().setDepth(5000).setScrollFactor(0);
    this.title = scene.add.text(0, 0, '', font(48, '#ffe45c')).setOrigin(0.5).setDepth(5001).setScrollFactor(0).setResolution(1).setVisible(false);
    this.word = scene.add.text(0, 0, '', font(44)).setOrigin(0.5).setDepth(5001).setScrollFactor(0).setResolution(1).setVisible(false);
    this.who = scene.add.text(0, 0, '', font(16, '#ffffff')).setOrigin(0.5).setDepth(5001).setScrollFactor(0).setResolution(1).setVisible(false);
    this.names = [scene.add.text(0, 0, '', font(11)).setOrigin(1, 0.5).setDepth(5001).setScrollFactor(0).setResolution(1).setVisible(false), scene.add.text(0, 0, '', font(11)).setOrigin(1, 0.5).setDepth(5001).setScrollFactor(0).setResolution(1).setVisible(false)];
  }

  destroy(): void { for (const o of [this.g, this.title, this.word, this.who, ...this.names]) o.destroy(); }

  update(m: Match, top: number, W: number, H: number, time: number): void {
    const g = this.g; g.clear();
    const pen = m.pen, on = m.phase === 'penalties' && !!pen;
    for (const o of [this.title, this.word, this.who, ...this.names]) o.setVisible(false);
    if (!on || !pen) return;
    // the dots: one row per team, the first five kicks and more in sudden death
    const n = Math.max(5, pen.kicks[0].length + 1, pen.kicks[1].length + 1), r = 6, gap = 17, pw = 104 + n * gap + 6, px = 8, x0 = px + 104 + Math.round(gap / 2), y0 = 40;   // top left, over the stands, so it never covers the goal
    g.fillStyle(0x2a1b3d, 0.82).fillRoundedRect(px, y0 - 12, pw, 46, 8);
    for (const t of [0, 1] as const) {
      const y = y0 + t * 20;
      this.names[t].setVisible(true).setText(this.teams[t].slice(0, 12)).setPosition(px + 98, y);
      for (let i = 0; i < n; i++) {
        const x = x0 + i * gap, k = pen.kicks[t][i];
        if (k === undefined) { g.lineStyle(2, 0xb6b0c8, 1).strokeCircle(x, y, r); if (pen.turn === t && i === pen.kicks[t].length && Math.floor(time * 4) % 2) g.fillStyle(0xffffff, 0.9).fillCircle(x, y, 3); }
        else if (k === 1) g.fillStyle(0x5ddb43, 1).fillCircle(x, y, r).lineStyle(2, 0x2a1b3d, 1).strokeCircle(x, y, r);
        else { g.fillStyle(0xff5e7e, 1).fillCircle(x, y, r).lineStyle(2, 0x2a1b3d, 1).strokeCircle(x, y, r); g.lineStyle(2, 0xffffff, 1).lineBetween(x - 3, y - 3, x + 3, y + 3).lineBetween(x + 3, y - 3, x - 3, y + 3); }
      }
    }
    const shooter = m.players.find((p) => p.id === pen.shooter);
    const human = shooter?.control === 'human';
    // the title of the shootout and the name of the one who kicks
    if (pen.step === 'ready') {
      if (pen.kicks[0].length + pen.kicks[1].length === 0) {
        const k = Math.min(1, pen.t / 0.2);
        this.title.setVisible(true).setText('¡PENALES!').setPosition(W / 2, H * 0.5).setFontSize(Math.round(48 + (1 - k) * 40)).setAlpha(Math.min(1, pen.t * 6));
      }
      this.who.setVisible(true).setText(`${shooter?.name ?? ''} patea`).setPosition(W / 2, H * 0.58);
    }
    // the word of the result
    if (pen.step === 'result' && pen.outcome) {
      const [txt, col] = TXT[pen.outcome], k = Math.min(1, pen.t / 0.12), shake = pen.t < 0.5 ? (Math.round(time * 60) % 2 ? 2 : -2) : 0;
      this.word.setVisible(true).setText(txt).setColor(col).setPosition(W / 2 + shake, H * 0.5).setFontSize(Math.round(44 + (1 - k) * 36));
      if (pen.winner !== null && pen.t > 0.7) this.who.setVisible(true).setText(`¡Ganan los ${this.teams[pen.winner]}!`).setPosition(W / 2, H * 0.56).setFontSize(20);
    }
  }
}
