import Phaser from 'phaser';
import type { Match } from '../core/state';
import { geyserState, type Hazard } from '../core/hazards';
import { PX, depthAt, wx, sy } from '../core/proj';

/** The traps of the pitch (core/hazards.ts), drawn on the grass under the players: the puddles of the Arrecife, the geysers of the Volcán
 *  (they smoke before they blow, so there is time to get off them), the mud of the Bosque and the springy clouds of the Nubes. What stands
 *  up from the ground (the fire of a geyser, a cloud that springs) is drawn at its own depth, in front of whoever is behind it. */
export class HazardView {
  private ground: Phaser.GameObjects.Graphics;
  private tall: Phaser.GameObjects.Graphics[] = [];
  constructor(scene: Phaser.Scene, private m: Match) {
    this.ground = scene.add.graphics().setDepth(4);
    for (const h of m.hazards) this.tall.push(scene.add.graphics().setDepth(depthAt(h.y) + (h.kind === 'geiser' ? 0.3 : -0.7)));
  }
  setMatch(m: Match): void { this.m = m; }
  destroy(): void { this.ground.destroy(); for (const g of this.tall) g.destroy(); }

  update(t: number): void {
    const g = this.ground; g.clear();
    this.m.hazards.forEach((h, i) => {
      const X = Math.round(wx(h.x, h.y)), Y = Math.round(sy(h.y)), w = h.rx * 2 * PX, d = h.ry * 2, top = this.tall[i]; top.clear();
      const age = this.m.t - h.pop;
      if (h.kind === 'charco') this.puddle(g, X, Y, w, d, t, age, i);
      else if (h.kind === 'barro') this.mud(g, X, Y, w, d, t, i);
      else if (h.kind === 'geiser') this.geyser(g, top, X, Y, w, d, t, h);
      else this.cloud(g, top, X, Y, w, d, t, age, i);
    });
  }

  private puddle(g: Phaser.GameObjects.Graphics, X: number, Y: number, w: number, d: number, t: number, age: number, i: number): void {
    g.fillStyle(0x1f5fae, 1).fillEllipse(X, Y, w + 4, d + 3).fillStyle(0x4aa8e8, 1).fillEllipse(X, Y, w, d).fillStyle(0x8fd2ff, 1).fillEllipse(X - w * 0.12, Y - d * 0.14, w * 0.6, d * 0.5);
    // the shine of the water moves
    for (let k = 0; k < 3; k++) { const a = t * 1.3 + k * 2.1 + i; g.fillStyle(0xffffff, 0.9).fillRect(Math.round(X + Math.cos(a) * w * 0.28) - 1, Math.round(Y + Math.sin(a * 1.4) * d * 0.22), 3, 1); }
    // somebody has just gone through it: rings on the water
    if (age < 0.6) for (const k of [0, 0.2]) { const u = Math.min(1, (age + k) / 0.7); g.lineStyle(1, 0xffffff, 1 - u).strokeEllipse(X, Y, w * u, d * u); }
  }

  private mud(g: Phaser.GameObjects.Graphics, X: number, Y: number, w: number, d: number, t: number, i: number): void {
    g.fillStyle(0x3d2610, 1).fillEllipse(X, Y, w + 4, d + 3).fillStyle(0x6b4424, 1).fillEllipse(X, Y, w, d).fillStyle(0x7e5530, 1).fillEllipse(X - w * 0.1, Y - d * 0.12, w * 0.7, d * 0.55);
    for (const [ox, oy, s] of [[-0.3, 0.1, 0.2], [0.22, -0.18, 0.16], [0.1, 0.22, 0.18], [-0.05, -0.25, 0.12]]) g.fillStyle(0x4a2e16, 1).fillEllipse(X + ox * w, Y + oy * d, w * s, d * s);
    // a bubble comes up now and then
    const u = (t * 0.6 + i * 0.37) % 1, bx = X + Math.sin(i * 7.3 + Math.floor(t * 0.6 + i * 0.37) * 2.4) * w * 0.28;
    if (u < 0.5) g.lineStyle(1, 0xa37a4e, 1).strokeCircle(bx, Y - d * 0.05, 1 + u * 5);
  }

  private geyser(g: Phaser.GameObjects.Graphics, top: Phaser.GameObjects.Graphics, X: number, Y: number, w: number, d: number, t: number, h: Hazard): void {
    const st = geyserState(h, this.m.t), hot = st === 0 ? 0x8a2e10 : Math.floor(t * 12) % 2 ? 0xffb030 : 0xff6a1a;
    g.fillStyle(0x2a2226, 1).fillEllipse(X, Y, w + 6, d + 5).fillStyle(0x55464a, 1).fillEllipse(X, Y - 1, w + 2, d + 1).fillStyle(0x1c1416, 1).fillEllipse(X, Y, w - 3, d - 3).fillStyle(hot, 1).fillEllipse(X, Y, w - 8, d - 6);
    if (st === 1) {
      // it smokes: get off it
      for (let k = 0; k < 4; k++) { const u = (t * 1.6 + k * 0.25) % 1; top.fillStyle(0xffffff, 0.75 * (1 - u)).fillRect(Math.round(X + Math.sin(k * 2.3 + t * 3) * 4) - 2, Math.round(Y - 4 - u * 22), 4, 4); }
    } else if (st === 2) {
      // it blows: a column of fire
      for (let k = 0; k < 11; k++) {
        const ww = Math.max(3, Math.round((w - 6) * (1 - k / 13) + Math.sin(t * 40 + k * 1.7) * 2)), col = k < 3 ? 0xffffff : k < 6 ? 0xffe45c : k < 9 ? 0xff8a2a : 0xe0301a;
        top.fillStyle(col, 1).fillRect(Math.round(X - ww / 2), Y - 5 - k * 5, ww, 5);
      }
      for (let k = 0; k < 5; k++) { const a = t * 9 + k * 1.3; top.fillStyle(0xffe45c, 1).fillRect(Math.round(X + Math.cos(a) * (w * 0.5 + 4)), Math.round(Y - 20 - ((t * 60 + k * 13) % 40)), 2, 2); }
    }
  }

  private cloud(g: Phaser.GameObjects.Graphics, top: Phaser.GameObjects.Graphics, X: number, Y: number, w: number, d: number, t: number, age: number, i: number): void {
    // its shadow on the grass, and the cloud floating a little over it; it squashes when something springs off it
    const sq = age < 0.22 ? 1 - Math.sin((age / 0.22) * Math.PI) * 0.45 : 1, bob = Math.round(Math.sin(t * 2 + i) * 1.5), cy = Y - 5 + bob + Math.round((1 - sq) * 5);
    g.fillStyle(0x000000, 0.22).fillEllipse(X, Y + 2, w, d * 0.7);
    top.fillStyle(0x9fc8f0, 1).fillEllipse(X, cy + 2, w + 2, (d + 2) * sq);
    for (const [ox, oy, s] of [[0, -0.1, 0.62], [-0.3, 0.05, 0.5], [0.3, 0.05, 0.5], [-0.12, -0.3, 0.42], [0.16, -0.26, 0.4]]) top.fillStyle(0xffffff, 1).fillEllipse(X + ox * w, cy + oy * d * sq, w * s, d * s * 1.3 * sq);
    top.fillStyle(0xdff0ff, 1).fillEllipse(X + w * 0.06, cy + d * 0.18 * sq, w * 0.55, d * 0.35 * sq);
  }
}
