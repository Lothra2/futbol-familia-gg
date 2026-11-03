import Phaser from 'phaser';
import type { Weather } from '../core/state';

interface Drop { x: number; y: number; v: number; l: number }

/** The weather of the Waiting Room drawn over the pitch: slanted rain with splashes and a grey light, or gusts and leaves that fly the way the
 *  wind blows. Screen space, a fixed number of drops, so it costs the same on a phone in every frame. */
export class WeatherView {
  private g: Phaser.GameObjects.Graphics;
  private tint: Phaser.GameObjects.Rectangle;
  private drops: Drop[] = [];
  private splash: { x: number; y: number; t: number }[] = [];
  private seed = 9;
  constructor(scene: Phaser.Scene, readonly weather: Weather, private wind = 0) {
    this.g = scene.add.graphics().setScrollFactor(0).setDepth(3540);
    this.tint = scene.add.rectangle(0, 0, 10, 10, 0xb8c4d8).setOrigin(0, 0).setScrollFactor(0).setDepth(3505).setBlendMode(Phaser.BlendModes.MULTIPLY).setVisible(weather === 'lluvia');
    const n = weather === 'lluvia' ? 90 : weather === 'viento' ? 26 : 0;
    for (let i = 0; i < n; i++) this.drops.push({ x: this.r() * 700, y: this.r() * 400, v: 0.7 + this.r() * 0.6, l: 0.6 + this.r() * 0.8 });
  }
  private r(): number { this.seed = (this.seed * 1664525 + 1013904223) >>> 0; return this.seed / 4294967296; }
  layout(w: number, h: number): void { this.tint.setSize(w, h); }
  destroy(): void { this.g.destroy(); this.tint.destroy(); }

  update(dt: number, W: number, H: number, camDx: number, camDy: number): void {
    const g = this.g; g.clear();
    if (this.weather === 'sol') return;
    if (this.weather === 'lluvia') {
      for (const d of this.drops) {
        d.x += (-60 * d.v) * dt - camDx * 0.6; d.y += 340 * d.v * dt - camDy * 0.6;
        if (d.y > H) { if (this.r() < 0.35) this.splash.push({ x: d.x, y: H * (0.2 + this.r() * 0.75), t: 0 }); d.y -= H + 20; d.x = this.r() * (W + 60); }
        if (d.x < -20) d.x += W + 40; if (d.x > W + 20) d.x -= W + 40;
        g.lineStyle(1, 0xdfefff, 0.55).lineBetween(Math.round(d.x), Math.round(d.y), Math.round(d.x + 3 * d.l), Math.round(d.y - 12 * d.l));
      }
      for (let i = this.splash.length - 1; i >= 0; i--) {
        const s = this.splash[i]; s.t += dt; s.x -= camDx; s.y -= camDy;
        const k = s.t / 0.25; if (k >= 1) { this.splash.splice(i, 1); continue; }
        g.lineStyle(1, 0xffffff, 0.6 * (1 - k)).strokeEllipse(Math.round(s.x), Math.round(s.y), 4 + k * 8, 2 + k * 3);
      }
      return;
    }
    // wind: long faint gusts and a few leaves, all moving the way it blows
    const dir = this.wind >= 0 ? 1 : -1;
    for (let i = 0; i < this.drops.length; i++) {
      const d = this.drops[i], leaf = i % 3 === 0;
      d.x += dir * (leaf ? 120 : 260) * d.v * dt - camDx * 0.8; d.y += (leaf ? Math.sin((d.x + i * 37) * 0.05) * 30 : 0) * dt - camDy * 0.8;
      if (d.x > W + 40) d.x -= W + 80; if (d.x < -40) d.x += W + 80; if (d.y > H + 10) d.y -= H + 20; if (d.y < -10) d.y += H + 20;
      if (leaf) g.fillStyle(i % 2 ? 0xe8a040 : 0x8ac850, 0.9).fillRect(Math.round(d.x), Math.round(d.y), 3, 2);
      else g.lineStyle(1, 0xffffff, 0.22).lineBetween(Math.round(d.x), Math.round(d.y), Math.round(d.x - dir * 26 * d.l), Math.round(d.y));
    }
  }
}
