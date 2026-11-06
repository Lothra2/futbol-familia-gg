import Phaser from 'phaser';
import type { Ball, SpecialKind } from '../core/state';
import { T } from '../core/tuning';
import { depthAt, wx, sy } from '../core/proj';

const TINT: Partial<Record<SpecialKind, number>> = { canonazo: 0xffb27a, llamarada: 0xffa040, relampago: 0xfff08a, estrellas: 0xe6d0ff, ola: 0x7bc8ff, picada: 0xfff3b0 };
/** The colour of the trail each power leaves (the afterimages of the Nekketsu super shots). */
const TRAIL: Record<SpecialKind, number> = { arcoiris: 0xff5e7e, burbuja: 0xbff3ff, canonazo: 0xffffff, estrellas: 0xffe45c, carrera: 0xffffff, relampago: 0xfff08a, llamarada: 0xff8a2a, ola: 0x5ab4ff, picada: 0xfff3b0, hojas: 0x5ddb43 };
const RAINBOW = [0xff5e7e, 0xffa040, 0xffe45c, 0x5ddb43, 0x5ab4ff, 0xb98cff];

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
  /** The last screen positions of a super shot, for its trail. */
  private trail: { x: number; y: number }[] = [];
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
    // a super shot (Nekketsu): the ball grows, leaves a trail of afterimages and takes the shape of its power
    this.sprite.setScale(kind ? 1.5 : 1);
    if (!kind) { this.trail.length = 0; return; }
    this.trail.unshift({ x, y }); if (this.trail.length > 9) this.trail.length = 9;
    const g = this.fx;
    this.trail.forEach((q, i) => {
      if (i === 0) return;
      const r = Math.max(2, 9 - i), col = kind === 'arcoiris' ? RAINBOW[i % RAINBOW.length] : TRAIL[kind];
      g.fillStyle(col, 0.75 - i * 0.07).fillCircle(q.x, q.y, r);
    });
    const dx = this.trail.length > 1 ? x - this.trail[1].x : 1, dy = this.trail.length > 1 ? y - this.trail[1].y : 0, n = Math.hypot(dx, dy) || 1, ux = dx / n, uy = dy / n;
    if (kind === 'llamarada' || kind === 'canonazo') {
      // a fireball: flames licking back from the ball
      for (let i = 0; i < 5; i++) {
        const f = Math.sin(t * 40 + i * 2) * 2, bx = x - ux * (6 + i * 3) - uy * f, by = y - uy * (6 + i * 3) + ux * f;
        g.fillStyle(i < 2 ? 0xffe45c : 0xff5e1a, 0.9 - i * 0.12).fillCircle(bx, by, 6 - i);
      }
    } else if (kind === 'ola') {
      // the blue ice ball of Nintendo World Cup: a big pale blue ball with a white shine
      g.fillStyle(0x2a6ad8, 1).fillCircle(x, y, 10).fillStyle(0x7bc8ff, 1).fillCircle(x, y, 8).fillStyle(0xd8f0ff, 1).fillCircle(x - 3, y - 3, 3);
    } else if (kind === 'picada') {
      // the boomerang: a crescent spinning round the ball
      const a = t * 18;
      for (let i = 0; i < 7; i++) { const b2 = a + (i - 3) * 0.32; g.fillStyle(0xfff3b0, 1).fillRect(Math.round(x + Math.cos(b2) * 10) - 1, Math.round(y + Math.sin(b2) * 6) - 1, 3, 3); }
    } else if (kind === 'relampago') {
      // lightning: a white and yellow zigzag back along the path
      g.lineStyle(2, 0xffffff, 1).beginPath().moveTo(x, y);
      for (let i = 1; i <= 4; i++) g.lineTo(x - ux * i * 7 + uy * (i % 2 ? 5 : -5), y - uy * i * 7 - ux * (i % 2 ? 5 : -5));
      g.strokePath();
    } else if (kind === 'estrellas' || kind === 'hojas') {
      for (let i = 0; i < 4; i++) {
        const a = t * 10 + i * 1.57, sx = Math.round(x + Math.cos(a) * 12), sy2 = Math.round(y + Math.sin(a) * 7);
        g.fillStyle(kind === 'hojas' ? 0x5ddb43 : 0xffe45c, 1).fillRect(sx - 2, sy2, 5, 1).fillRect(sx, sy2 - 2, 1, 5);
      }
    }
    if (kind === 'burbuja') {
      const r = 12 + Math.round(Math.sin(t * 9) * 1);
      this.fx.fillStyle(0xbff3ff, 0.28).fillCircle(x, y, r).lineStyle(1, 0xffffff, 0.95).strokeCircle(x, y, r);
      this.fx.fillStyle(0xffffff, 0.9).fillRect(x - 4, y - 5, 2, 2);
    }
  }
}
