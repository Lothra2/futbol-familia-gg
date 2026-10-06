import Phaser from 'phaser';
import { LoopClock, type AnimMeta } from './anim';
import { PoseSmoother, isLoop, logicalPose, resolvePose, sequenceFrame, type Atlas } from './poses';
import type { Player } from '../core/state';
import { JERSEY } from '../core/types';
import type { Fx } from './Fx';

/** `bob`: the run frames of this atlas are alike, so the sprite hops a pixel twice per cycle (Juandi). */
export interface SpriteMeta { cell: [number, number]; pivot: [number, number]; anims: Record<string, AnimMeta>; bob?: boolean }
export const COLORS: Record<string, number> = { sophie: 0x4fd65c, alana: 0xff6fb5, papa: 0xe8423a, mama: 0x9b5de5, juandi: 0x2f6fe0, thor: 0x3fb6f2 };
export const J_COLORS = [0xffd447, 0x7be3ff];

/** One footballer on the screen: the sprite from the state of the core, a shadow, and for the player a human moves a ring, an arrow and the stamina bar. */
export class PlayerView {
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly shadow: Phaser.GameObjects.Image;
  readonly ring: Phaser.GameObjects.Image;
  readonly arrow: Phaser.GameObjects.Image;
  readonly bar: Phaser.GameObjects.Graphics;
  /** The shirt number over the head (only characters with a number in JERSEY). */
  readonly tag: Phaser.GameObjects.Image | null = null;
  private loops = new LoopClock();
  private smooth = new PoseSmoother();
  private atlas: Atlas;
  private lastAnim = '';
  /** Lean slices: the upper bands of the sprite shift forward a pixel or two while sprinting, like a sheared pixel drawing. */
  private slices: Phaser.GameObjects.Sprite[] = [];
  private ghosts: Phaser.GameObjects.Sprite[] = [];
  private ghostT = 0; private ghostI = 0;
  private lastFrame = -1;
  /** Level 3 and up: the celebration after a goal glows gold and throws sparks. */
  gold = false; private goldT = 0;
  private pvx = 0; private pvy = 0; private skidT = 0;

  constructor(private scene: Phaser.Scene, public p: Player, private key: string, private meta: SpriteMeta, private fx?: Fx) {
    this.atlas = meta.anims;
    this.shadow = scene.add.image(0, 0, 'shadow').setOrigin(0.5, 0.5);
    this.ring = scene.add.image(0, 0, 'ring').setOrigin(0.5, 0.5).setVisible(false);
    this.sprite = scene.add.sprite(0, 0, key, 0).setOrigin(meta.pivot[0] / meta.cell[0], meta.pivot[1] / meta.cell[1]);
    for (let i = 0; i < 2; i++) this.slices.push(scene.add.sprite(0, 0, key, 0).setOrigin(meta.pivot[0] / meta.cell[0], meta.pivot[1] / meta.cell[1]).setVisible(false));
    for (let i = 0; i < 3; i++) this.ghosts.push(scene.add.sprite(0, 0, key, 0).setOrigin(meta.pivot[0] / meta.cell[0], meta.pivot[1] / meta.cell[1]).setVisible(false));
    this.arrow = scene.add.image(0, 0, 'arrow').setOrigin(0.5, 1).setVisible(false);
    this.bar = scene.add.graphics();
    const n = p.charId ? JERSEY[p.charId] : undefined;
    if (n !== undefined && scene.textures.exists(`num_${n}`)) this.tag = scene.add.image(0, 0, `num_${n}`).setOrigin(0.5, 1);
  }
  destroy(): void { for (const o of [...this.slices, ...this.ghosts]) o.destroy(); this.tag?.destroy(); this.sprite.destroy(); this.shadow.destroy(); this.ring.destroy(); this.arrow.destroy(); this.bar.destroy(); }

  /** Main sprite, or the three bands (legs and two upper slices) when leaning. `lean` is the sign of the forward direction, 0 for none. */
  private setBody(frame: number, x: number, y: number, flip: boolean, depth: number, lean: number): void {
    const [cw, ch] = this.meta.cell, py = this.meta.pivot[1], cut1 = py - 26, cut2 = py - 14;
    if (lean === 0) {
      this.sprite.setFrame(frame).setPosition(x, y).setFlipX(flip).setDepth(depth).setCrop();
      for (const o of this.slices) o.setVisible(false);
      return;
    }
    this.sprite.setFrame(frame).setPosition(x, y).setFlipX(flip).setDepth(depth).setCrop(0, cut2, cw, ch - cut2);
    this.slices[0].setVisible(true).setFrame(frame).setPosition(x + lean * 2, y).setFlipX(flip).setDepth(depth + 0.01).setCrop(0, 0, cw, cut1);
    this.slices[1].setVisible(true).setFrame(frame).setPosition(x + lean, y).setFlipX(flip).setDepth(depth + 0.01).setCrop(0, cut1, cw, cut2 - cut1);
  }

  /** Sprint afterimages: three ghosts of the last frames fade out behind the player. */
  private afterimages(dt: number, on: boolean, frame: number, x: number, y: number, flip: boolean, depth: number, tint: number): void {
    this.ghostT -= dt;
    if (on && this.ghostT <= 0) {
      this.ghostT = 0.05;
      const g = this.ghosts[this.ghostI++ % this.ghosts.length];
      g.setVisible(true).setFrame(frame).setPosition(x, y).setFlipX(flip).setDepth(depth).setTint(tint).setAlpha(0.28);
    }
    for (const g of this.ghosts) if (g.visible) { g.setAlpha(g.alpha - dt * 2.6); if (g.alpha <= 0.02) g.setVisible(false); }
  }

  /** `fieldTop` is the screen y of world y = 0. The camera scrolls the world, so positions are world positions. */
  update(dt: number, fieldTop: number, humanSlot: number | null, jColor: number): void {
    const p = this.p;
    const x = Math.round(p.x), gy = Math.round(fieldTop + p.y);
    let y = Math.round(fieldTop + p.y - p.z);
    const speed = Math.hypot(p.vx, p.vy);
    // one cycle (two strides) covers about 46 px of ground, so the feet do not slide: pace follows the real speed
    this.loops.ease(Math.max(0.5, Math.min(1.9, speed / 92)), dt);
    // a sudden turn at speed: a skid pose and a puff of dust
    const dot = (p.vx * this.pvx + p.vy * this.pvy) / (Math.max(1, speed) * Math.max(1, Math.hypot(this.pvx, this.pvy)));
    if (Math.hypot(this.pvx, this.pvy) > 70 && speed > 25 && dot < 0.1 && p.state !== 'kick') { this.skidT = 0.2; this.fx?.puff(x, gy, -p.facing * 30, 4); }
    this.pvx = p.vx; this.pvy = p.vy; this.skidT = Math.max(0, this.skidT - dt);
    const logical = this.smooth.update(logicalPose(p), dt);
    const name = resolvePose(this.atlas, logical), anim = this.atlas[name];
    let frame: number;
    if (isLoop(logical)) frame = this.loops.frame(this.atlas, name, dt);
    else frame = anim.start + sequenceFrame(anim, logical, p.act ? p.act.t : p.stateT, p);
    if (this.skidT > 0 && logical === 'run' && this.atlas.skid) frame = this.atlas.skid.start;
    if (name !== this.lastAnim) { this.lastAnim = name; }
    if (this.meta.bob && logical === 'run') y -= Math.floor(this.loops.cycle * 4) % 2;   // hop twice per cycle
    const running = logical === 'run' && this.skidT <= 0;
    const sprinting = running && p.state === 'sprint';
    // foot falls: a small puff when a stride starts (frames 0 and 3 of the cycle)
    if (running && frame !== this.lastFrame && p.z < 2 && speed > 60) {
      const rel = frame - anim.start;
      if ((rel === 0 || rel === 3) && this.fx) this.fx.puff(x - p.facing * 6, gy, -p.facing * (10 + speed * 0.12), sprinting ? 3 : 1);
    }
    this.lastFrame = frame;
    if (this.gold && p.state === 'celebrate') {
      this.goldT += dt;
      const k = 0.5 + 0.5 * Math.sin(this.goldT * 14);
      this.sprite.setTint(k > 0.5 ? 0xfff3b0 : 0xffd447);
      if (this.fx && Math.floor(this.goldT * 18) !== Math.floor((this.goldT - dt) * 18)) this.fx.sparkle(x + (Math.random() - 0.5) * 20, y - 10 - Math.random() * 26);
    } else if (this.goldT > 0) { this.goldT = 0; this.sprite.clearTint(); }
    const lean = 0;   // no sheared slices: they made every sprinting player look blurred
    this.setBody(frame, x, y, p.facing < 0, 200 + p.y, lean * p.facing);
    this.afterimages(dt, sprinting && humanSlot !== null, frame, x, y, p.facing < 0, 199.2 + p.y / 1000, p.team === 0 ? 0x9bff9b : 0xff9b9b);
    const k = Math.max(0.5, 1 - p.z / 80);
    this.shadow.setPosition(x, gy).setScale(k, 1).setDepth(199);
    const mine = humanSlot !== null;
    this.ring.setVisible(mine).setPosition(x, gy).setTint(jColor).setDepth(199.5);
    this.arrow.setVisible(mine).setPosition(x, y - 40).setTint(jColor).setDepth(1000 + p.y);
    // the number floats over the head, above the arrow of the human who moves him
    this.tag?.setPosition(x, y - (mine ? 50 : 42)).setDepth(1000 + p.y);
    this.bar.clear();
    if (mine) {
      const w = 12, v = Math.max(0, Math.min(1, p.stamina / 100));
      this.bar.fillStyle(0x2a1b3d).fillRect(x - w / 2 - 1, gy + 4, w + 2, 4).fillStyle(p.sprintLock ? 0xff5e7e : v < 0.25 ? 0xffb23f : 0x5ddb43).fillRect(x - w / 2, gy + 5, Math.round(w * v), 2).setDepth(1000 + p.y);
    }
  }
}
