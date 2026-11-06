import Phaser from 'phaser';
import type { Ball, SpecialKind } from '../core/state';
import { T } from '../core/tuning';
import { depthAt, wx, sy } from '../core/proj';

const TINT: Partial<Record<SpecialKind, number>> = { canonazo: 0xffb27a, llamarada: 0xffa040, relampago: 0xfff08a, estrellas: 0xe6d0ff, ola: 0xbfe9ff };

/** Where a ball in the air touches the ground again (same gravity and drag as the core, no bounce). */
export function landingOf(b: Ball): { x: number; y: number; t: number } | null {
  if (b.z <= 0 && b.vz <= 0) return null;
  const g = T.gravity, t = (b.vz + Math.sqrt(b.vz * b.vz + 2 * g * Math.max(0, b.z))) / g;
  const k = (1 - Math.exp(-T.airDrag * t)) / T.airDrag;
  return { x: b.x + b.vx * k, y: b.y + b.vy * k, t };
}

/** The ball, its shadow on the ground (that is how you read its height, like the NES game), the cross where a high ball will land,
 *  and what a special adds while it flies (a bubble round the ball, a tint of the colour of the power). */
export class BallView {
  readonly sprite: Phaser.GameObjects.Image;
  readonly shadow: Phaser.GameObjects.Image;
  private land: Phaser.GameObjects.Image;
  private fx: Phaser.GameObjects.Graphics;
  /** The replay shows the ball of the recording instead of the live one. */
  setBall(b: Ball): void { this.ball = b; }
  constructor(scene: Phaser.Scene, private ball: Ball) {
    this.shadow = scene.add.image(0, 0, 'shadow').setOrigin(0.5, 0.5).setScale(0.9, 1);
    this.land = scene.add.image(0, 0, 'land').setOrigin(0.5, 0.5).setVisible(false).setAlpha(0.8);
    this.sprite = scene.add.image(0, 0, 'ballbig', 0).setOrigin(0.5, 0.5);
    this.fx = scene.add.graphics();
  }
  update(kind: SpecialKind | null = null, t = 0): void {
    const b = this.ball;
    const x = Math.round(wx(b.x, b.y)), gy = Math.round(sy(b.y)), y = Math.round(sy(b.y, b.z) - 5);
    const k = Math.max(0.5, 0.95 - b.z / 120);
    this.sprite.setFrame(Math.floor(b.roll / 5) % 4).setPosition(x, y).setDepth(depthAt(b.y) + 0.5);
    this.shadow.setPosition(x, gy).setScale(k, 1).setDepth(depthAt(b.y) - 0.6);
    const l = b.z > 18 && b.state === 'free' && !kind ? landingOf(b) : null;
    this.land.setVisible(!!l && Math.floor(t * 8) % 2 === 0);
    if (l) this.land.setPosition(Math.round(wx(l.x, l.y)), Math.round(sy(l.y))).setDepth(depthAt(l.y) - 0.7);
    this.fx.clear().setDepth(depthAt(b.y) + 0.6);
    const tint = kind ? TINT[kind] : undefined;
    if (tint !== undefined) this.sprite.setTint(tint); else this.sprite.clearTint();
    if (kind === 'burbuja') {
      const r = 12 + Math.round(Math.sin(t * 9) * 1);
      this.fx.fillStyle(0xbff3ff, 0.28).fillCircle(x, y, r).lineStyle(1, 0xffffff, 0.95).strokeCircle(x, y, r);
      this.fx.fillStyle(0xffffff, 0.9).fillRect(x - 4, y - 5, 2, 2);
    }
  }
}
