import Phaser from 'phaser';
import type { Ball, SpecialKind } from '../core/state';

const TINT: Partial<Record<SpecialKind, number>> = { canonazo: 0xffb27a, llamarada: 0xffa040, relampago: 0xfff08a, estrellas: 0xe6d0ff, ola: 0xbfe9ff };

/** The ball, its shadow, and what a special adds while it flies (a bubble round the ball, a tint of the colour of the power). */
export class BallView {
  readonly sprite: Phaser.GameObjects.Image;
  readonly shadow: Phaser.GameObjects.Image;
  private fx: Phaser.GameObjects.Graphics;
  /** The replay shows the ball of the recording instead of the live one. */
  setBall(b: Ball): void { this.ball = b; }
  constructor(scene: Phaser.Scene, private ball: Ball) {
    this.shadow = scene.add.image(0, 0, 'shadow').setOrigin(0.5, 0.5).setScale(0.6, 0.8);
    this.sprite = scene.add.image(0, 0, 'ball', 0).setOrigin(0.5, 0.5);
    this.fx = scene.add.graphics();
  }
  update(fieldTop: number, kind: SpecialKind | null = null, t = 0): void {
    const b = this.ball;
    const x = Math.round(b.x), gy = Math.round(fieldTop + b.y), y = Math.round(fieldTop + b.y - b.z - 3);
    const k = Math.max(0.35, 0.7 - b.z / 120);
    this.sprite.setFrame(Math.floor(b.roll / 4) % 4).setPosition(x, y).setDepth(200 + b.y + 0.5);
    this.shadow.setPosition(x, gy).setScale(k, 0.8).setDepth(199);
    this.fx.clear().setDepth(200 + b.y + 0.6);
    const tint = kind ? TINT[kind] : undefined;
    if (tint !== undefined) this.sprite.setTint(tint); else this.sprite.clearTint();
    if (kind === 'burbuja') {
      const r = 9 + Math.round(Math.sin(t * 9) * 1);
      this.fx.fillStyle(0xbff3ff, 0.28).fillCircle(x, y, r).lineStyle(1, 0xffffff, 0.95).strokeCircle(x, y, r);
      this.fx.fillStyle(0xffffff, 0.9).fillRect(x - 4, y - 5, 2, 2);
    }
  }
}
