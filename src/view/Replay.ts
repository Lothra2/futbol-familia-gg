import Phaser from 'phaser';
import type { Ball, Match, Player, SpecialKind } from '../core/state';
import { CAM_MAX_X, CAM_MIN_X } from '../core/field';

/** One drawn moment: every player and the ball as they were (copies: the match keeps moving on). */
export interface Snap { rt: number; ps: Player[]; ball: Ball; kind: SpecialKind | null }

/** Remembers the last seconds of open play so the goal can be shown again. `rt` only runs while recording, so a cinematic leaves no gap. */
export class Recorder {
  private frames: Snap[] = [];
  private rt = 0;
  constructor(private keep = 4) {}
  reset(): void { this.frames = []; this.rt = 0; }
  record(m: Match, dt: number): void {
    this.rt += dt;
    this.frames.push({ rt: this.rt, ps: m.players.map((p) => ({ ...p, act: p.act ? { ...p.act } : null })), ball: { ...m.ball }, kind: m.flight ? m.flight.kind : null });
    while (this.frames.length > 2 && this.frames[0].rt < this.rt - this.keep) this.frames.shift();
  }
  /** The last `secs` seconds of what was recorded. */
  clip(secs: number): Snap[] { const end = this.rt; return this.frames.filter((f) => f.rt >= end - secs); }
}

const font = (px: number, color = '#ffffff'): Phaser.Types.GameObjects.Text.TextStyle => ({ fontFamily: 'Pixelify, sans-serif', fontSize: `${px}px`, fontStyle: 'bold', color, stroke: '#2A1B3D', strokeThickness: Math.max(3, Math.round(px / 6)) });

/** The look of a replay on TV: cinema bars, a warm tint, thin scan lines, a blinking REPETICIÓN badge and the hint to skip it. */
export class ReplayOverlay {
  private g: Phaser.GameObjects.Graphics;
  private tint: Phaser.GameObjects.Rectangle;
  private tag: Phaser.GameObjects.Text;
  private hint: Phaser.GameObjects.Text;
  constructor(scene: Phaser.Scene) {
    this.tint = scene.add.rectangle(0, 0, 10, 10, 0xffe2b0).setOrigin(0, 0).setDepth(5290).setScrollFactor(0).setBlendMode(Phaser.BlendModes.MULTIPLY).setVisible(false);
    this.g = scene.add.graphics().setDepth(5300).setScrollFactor(0).setVisible(false);
    this.tag = scene.add.text(0, 0, 'REPETICIÓN', font(11, '#ffffff')).setOrigin(0, 0.5).setDepth(5301).setScrollFactor(0).setResolution(1).setVisible(false);
    this.hint = scene.add.text(0, 0, 'toca para saltar', font(9, '#d8caf0')).setOrigin(1, 1).setDepth(5301).setScrollFactor(0).setResolution(1).setVisible(false);
  }
  show(on: boolean): void { this.g.setVisible(on); this.tint.setVisible(on); this.tag.setVisible(on); this.hint.setVisible(on); if (!on) this.g.clear(); }
  draw(W: number, H: number, t: number, slow: number): void {
    const g = this.g; g.clear();
    this.tint.setSize(W, H);
    const bar = Math.max(18, Math.round(H * 0.075));
    g.fillStyle(0x080410, 1).fillRect(0, 0, W, bar).fillRect(0, H - bar, W, bar);
    g.fillStyle(0xff5e7e, 1).fillRect(0, bar, W, 2).fillRect(0, H - bar - 2, W, 2);
    for (let y = bar + 1; y < H - bar; y += 3) { g.fillStyle(0x000000, 0.07).fillRect(0, y, W, 1); }
    for (let i = 0; i < 4; i++) { g.fillStyle(0x000000, 0.14 - i * 0.03); const e = 6 + i * 8; g.fillRect(0, bar, W, e).fillRect(0, H - bar - e, W, e).fillRect(0, bar, e, H).fillRect(W - e, bar, e, H); }
    const blink = Math.floor(t * 2) % 2 === 0;
    if (blink) g.fillStyle(0xff3b3b, 1).fillCircle(16, bar / 2, 6).lineStyle(2, 0x2a1b3d, 1).strokeCircle(16, bar / 2, 6);
    this.tag.setPosition(28, bar / 2 + 1);
    this.hint.setPosition(W - 8, H - bar / 2 + 5);
    void slow;
  }
  destroy(): void { this.g.destroy(); this.tint.destroy(); this.tag.destroy(); this.hint.destroy(); }
}

/** Plays a clip back in slow motion and says where the camera is. */
export class ReplayPlayer {
  t = 0; camX = 0;
  constructor(readonly clip: Snap[], readonly speed = 0.5, private hold = 0.7) {
    this.camX = this.target(clip[0], 640);
  }
  get length(): number { return this.clip.length ? this.clip[this.clip.length - 1].rt - this.clip[0].rt : 0; }
  get done(): boolean { return this.t >= this.length / this.speed + this.hold; }
  private target(s: Snap, W: number): number { const b = s.ball; return Math.max(CAM_MIN_X, Math.min(CAM_MAX_X - W, b.x + Math.max(-60, Math.min(60, b.vx * 0.25)) - W / 2)); }
  /** The snapshot at the current time (the last one while it holds on the final picture). */
  frame(): Snap {
    const t0 = this.clip[0].rt + this.t * this.speed;
    let i = 0; while (i < this.clip.length - 1 && this.clip[i + 1].rt <= t0) i++;
    return this.clip[i];
  }
  step(dt: number, W: number): Snap {
    this.t += dt;
    const f = this.frame();
    this.camX += (this.target(f, W) - this.camX) * Math.min(1, 5 * dt);
    return f;
  }
}
