import Phaser from 'phaser';
import type { Match } from '../core/state';
import { T } from '../core/tuning';
import { goalX } from '../core/field';
import { fkMeter, fkPath } from '../core/freekick';

const INK = 0x2a1b3d;
const font = (px: number, color: string): Phaser.Types.GameObjects.Text.TextStyle => ({ fontFamily: 'Pixelify, sans-serif', fontSize: `${px}px`, fontStyle: 'bold', color, stroke: '#2A1B3D', strokeThickness: 3 });

/**
 * The free kick, drawn over the pitch for whoever takes it: the path of the ball from the spot to the goal (it bends as much as the effect says),
 * the mark in the goal where it is aimed, and the meter over the taker, which swings up and down. The kick is best when it is pressed at the top (¡AHORA!).
 * Pure view: it reads `m.restart` and never changes it. The AI only shows a faint path.
 */
export class FreeKickView {
  private g: Phaser.GameObjects.Graphics;
  private label: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    this.g = scene.add.graphics().setDepth(900);
    this.label = scene.add.text(0, 0, '', font(10, '#ffffff')).setOrigin(0.5, 1).setDepth(901).setResolution(1).setVisible(false);
  }

  destroy(): void { this.g.destroy(); this.label.destroy(); }

  update(m: Match, top: number, time: number): void {
    const g = this.g; g.clear(); this.label.setVisible(false);
    const r = m.restart;
    if (m.phase !== 'restart' || !r || r.kind !== 'freekick' || !r.fk) return;
    const taker = m.players.find((p) => p.id === r.taker);
    if (!taker || r.t < 0.3) return;
    const human = taker.control === 'human', easy = human && taker.controls === 'easy', a = human ? 1 : 0.25, fk = r.fk;
    const bx = Math.round(r.x), by = Math.round(top + r.y - 3), gx = Math.round(goalX(r.team)), gy = Math.round(top + fk.aimY - 8);
    const path = fkPath(m, r);
    // the path: the ball starts towards `start` and bends `drift` px on the way, so at the goal it is on the aimed point
    let px = bx, py = by;
    const n = 14;
    for (let i = 1; i <= n; i++) {
      const u = i / n, qx = Math.round(bx + (gx - bx) * u), qy = Math.round(by + (top + path.start - 8 - by) * u + path.drift * u * u);
      if (i % 2) { g.lineStyle(3, INK, 0.5 * a).lineBetween(px, py, qx, qy); g.lineStyle(2, 0xffffff, 0.95 * a).lineBetween(px, py, qx, qy); }
      px = qx; py = qy;
    }
    // the mark in the goal
    const k = 0.5 + 0.5 * Math.sin(time * 9), rr = 6 + k * 2;
    g.lineStyle(3, INK, a).strokeCircle(gx, gy, rr + 1).lineStyle(2, 0xffe45c, a).strokeCircle(gx, gy, rr);
    g.lineStyle(2, 0xffffff, a).lineBetween(gx - rr - 4, gy, gx - rr + 2, gy).lineBetween(gx + rr - 2, gy, gx + rr + 4, gy);
    if (!human || easy) return;
    // the meter over the taker (full controls): the cursor rises and falls, the top is the sweet spot
    const u = fkMeter(r.t), w = 30, h = 5, x0 = Math.round(taker.x - w / 2), y0 = Math.round(top + taker.y - 70), sweet = u >= T.free.sweet;
    g.fillStyle(INK, 1).fillRect(x0 - 1, y0 - 1, w + 2, h + 2);
    g.fillStyle(0x4a3a5c, 1).fillRect(x0, y0, w, h);
    g.fillStyle(0x5ddb43, 1).fillRect(x0 + Math.round(w * T.free.sweet), y0, w - Math.round(w * T.free.sweet), h);
    g.fillStyle(sweet ? 0xffffff : 0xffe45c, 1).fillRect(x0 + Math.round(w * u) - 1, y0 - 2, 3, h + 4);
    this.label.setVisible(true).setText(sweet ? '¡AHORA!' : 'TIRO LIBRE').setColor(sweet ? '#9dff7a' : '#ffffff').setFontSize(sweet ? 12 : 10).setPosition(Math.round(taker.x), y0 - 4);
  }
}
