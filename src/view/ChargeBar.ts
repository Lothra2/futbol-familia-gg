import Phaser from 'phaser';
import type { Match } from '../core/state';
import { wx, sy } from '../core/proj';

/** The little bar of a special that is loading, over the head of the shooter (Nekketsu: no film, the match never stops). It fills from
 *  left to right; the green part is good and the yellow part in it is perfect: Tiro or Especial lets it go. It also shows for the specials
 *  of the rivals, so there is a moment to see it coming. */
export class ChargeBar {
  private g: Phaser.GameObjects.Graphics;
  private hold = 0; private last: { x: number; y: number; hit: number } | null = null;
  private tag: Phaser.GameObjects.Text;
  constructor(private scene: Phaser.Scene) {
    this.g = scene.add.graphics().setDepth(3000);
    this.tag = scene.add.text(0, 0, '¡TAPA!', { fontFamily: 'Pixelify, sans-serif', fontSize: '10px', fontStyle: 'bold', color: '#7bc8ff', stroke: '#1a1230', strokeThickness: 3 }).setOrigin(0.5, 1).setDepth(3001).setVisible(false);
  }
  /** The bar was let go: it stays a moment in the colour of how it went (2 perfect, 1 good, 0 neither). */
  result(hit: number): void { if (this.last) { this.last.hit = hit; this.hold = 0.28; } }
  update(m: Match, dt: number, t: number): void {
    const g = this.g; g.clear(); this.tag.setVisible(false);
    const sp = m.special, W = 54, H = 8;
    if (sp) {
      const s = m.players.find((p) => p.id === sp.shooter);
      if (!s) return;
      // over his head; near the top of the screen, where the scoreboard and the little map are, it goes under his feet
      const view = this.scene.cameras.main.worldView, head = Math.round(sy(s.y, s.z)) - 60, low = head < view.y + view.height * 0.3;
      const x = Math.round(wx(s.x, s.y)) - W / 2, y = low ? Math.round(sy(s.y)) + 12 : head, u = Math.min(1, sp.t / sp.dur), ch = sp.charge;
      this.last = { x, y, hit: -1 }; this.hold = 0;
      // the bar of a rival that a person can answer (Tiro in time braces her keeper) has a blue frame and says so
      const mine = ch.def && ch.slot !== null;
      g.fillStyle(mine ? 0x2a6ad8 : 0x1a1230, 1).fillRect(x - 2, y - 2, W + 4, H + 4).fillStyle(0x3a3060, 1).fillRect(x, y, W, H);
      if (mine && !ch.hit) this.tag.setOrigin(0.5, low ? 0 : 1).setPosition(x + W / 2, low ? y + H + 3 : y - 3).setVisible(Math.floor(t * 8) % 4 !== 3);
      g.fillStyle(0x3fae4a, 1).fillRect(x + Math.round(ch.good[0] * W), y, Math.round((ch.good[1] - ch.good[0]) * W), H);
      g.fillStyle(0xffe45c, 1).fillRect(x + Math.round(ch.perfect[0] * W), y, Math.round((ch.perfect[1] - ch.perfect[0]) * W), H);
      // what is loaded so far, and the needle; it blinks while the needle is in the yellow
      const inY = u >= ch.perfect[0] && u <= ch.perfect[1], col = inY && Math.floor(t * 20) % 2 ? 0xffffff : 0xff8a2a;
      g.fillStyle(col, 0.85).fillRect(x, y + 2, Math.round(u * W), H - 4);
      g.fillStyle(0xffffff, 1).fillRect(x + Math.round(u * W) - 1, y - 3, 3, H + 6).fillStyle(0x1a1230, 1).fillRect(x + Math.round(u * W), y - 2, 1, H + 4);
      return;
    }
    if (this.hold > 0 && this.last) {
      this.hold -= dt;
      const { x, y, hit } = this.last, col = hit === 2 ? 0xffe45c : hit === 1 ? 0x5ddb43 : 0x9a94b8;
      if (Math.floor(this.hold * 30) % 2) g.fillStyle(0x1a1230, 1).fillRect(x - 2, y - 2, W + 4, H + 4).fillStyle(col, 1).fillRect(x, y, W, H);
    }
  }
}
