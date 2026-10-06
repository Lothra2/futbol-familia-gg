import Phaser from 'phaser';
import type { MatchEvent } from '../core/types';
import { KIND_INDEX } from '../core/specials';

interface P { img: Phaser.GameObjects.Image; vx: number; vy: number; g: number; life: number; max: number; spin: number }
const MAX = 80;
const CONF = [0xff5e7e, 0xffb23f, 0xffe45c, 0x5ddb43, 0x4cc9e8, 0xb98cff, 0xffffff];

/** Small pooled effects that help to read the action (max 80 at once, every one with the palette). Positions are world coordinates. */
export class Fx {
  private ps: P[] = [];
  private pool: Phaser.GameObjects.Image[] = [];
  constructor(private scene: Phaser.Scene) {}

  private spawn(tex: string, x: number, y: number, vx: number, vy: number, g: number, life: number, tint?: number, depth = 600): void {
    if (this.ps.length >= MAX) { const o = this.ps.shift()!; o.img.setVisible(false); this.pool.push(o.img); }
    const img = this.pool.pop() ?? this.scene.add.image(0, 0, tex);
    img.setTexture(tex).setVisible(true).setScale(1).setAlpha(1).setPosition(x, y).setDepth(depth).setAngle(0);
    if (tint !== undefined) img.setTint(tint); else img.clearTint();
    this.ps.push({ img, vx, vy, g, life, max: life, spin: 0 });
  }

  /** A golden spark that floats up (level 3 celebration). */
  sparkle(x: number, y: number): void { this.spawn('spark', x, y, (Math.random() - 0.5) * 20, -18 - Math.random() * 14, 10, 0.5, 0xffe45c, 620); }

  /** A small puff of dust at the feet (world coordinates, `y` is the screen y of the ground). */
  puff(x: number, y: number, vx: number, n = 1): void {
    for (let i = 0; i < n; i++) this.spawn('dust', x + (Math.random() - 0.5) * 4, y - 1, vx * (0.6 + Math.random() * 0.6), -8 - Math.random() * 10, 14, 0.28, undefined, 198);
  }

  /** `top` is the screen y of world y = 0. */
  event(e: MatchEvent, top: number, rnd: () => number, gold = false): void {
    const x = e.x, y = top + e.y - e.z;
    switch (e.k) {
      case 'slide': case 'bump': for (let i = 0; i < 4; i++) this.spawn('dust', x + (rnd() - 0.5) * 8, top + e.y - 2, (rnd() - 0.5) * 40, -10 - rnd() * 20, 20, 0.35); break;
      case 'bounce': if ((e.v ?? 0) > 120) this.spawn('dust', x, top + e.y - 1, 0, -8, 10, 0.25); break;
      case 'post': case 'bar': for (let i = 0; i < 4; i++) this.spawn('spark', x, y, (rnd() - 0.5) * 120, -40 - rnd() * 40, 160, 0.3); break;
      case 'zas': for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; this.spawn('dust', x, top + e.y - 4, Math.cos(a) * 50, Math.sin(a) * 30, 0, 0.35); } break;
      case 'kick': {
        const v = e.v ?? 0;
        if (v > 420) for (let i = 0; i < 3; i++) this.spawn('spark', x, y, (rnd() - 0.5) * 60, -20 - rnd() * 20, 100, 0.2);
        if (v > 300) { this.spawn('ring', x, y, 0, 0, 0, 0.22, 0xffffff, 610); this.spawn('ring', x, y + 1, 0, 0, 0, 0.3, 0xffe45c, 609); }
        break;
      }
      case 'pass': this.spawn('ring', x, y, 0, 0, 0, 0.16, 0xbff3ff, 610); break;
      case 'goal': {
        const gx = e.x < 480 ? -4 : 964;
        for (let i = 0; i < 46; i++) this.spawn('confetti', gx + (rnd() - 0.5) * 120, top - 30 - rnd() * 50, (rnd() - 0.5) * 70, 10 + rnd() * 50, 90, 2.6 + rnd(), CONF[i % CONF.length], 900);
        break;
      }
      case 'trail': {
        const kind = KIND_INDEX[e.v ?? 0], c = (arr: number[]): number => arr[Math.floor(rnd() * arr.length)];
        const GOLD = [0xffe45c, 0xfff3b0, 0xffb23f];
        const sp = (tex: string, cols: number[], vx: number, vy: number, g: number, life: number): void => this.spawn(tex, x + (rnd() - 0.5) * 4, y + (rnd() - 0.5) * 4, vx + (rnd() - 0.5) * 30, vy + (rnd() - 0.5) * 30, g, life, c(gold ? GOLD : cols), 590);
        if (gold) sp('star', GOLD, 0, 6, 20, 0.6);
        switch (kind) {
          case 'arcoiris': sp('spark', [0xff5e7e, 0xffb23f, 0xffe45c, 0x5ddb43, 0x4cc9e8, 0x6d7bff, 0xb98cff], 0, 6, 0, 0.5); break;
          case 'burbuja': if (rnd() < 0.4) sp('ring', [0xbff3ff, 0xffffff], 0, -14, 0, 0.6); break;
          case 'canonazo': sp('spark', [0xff4d2e, 0xff9a2e, 0xffe45c], -20, -4, 0, 0.35); sp('dust', [0xdddddd], -10, -6, 0, 0.3); break;
          case 'estrellas': if (rnd() < 0.5) sp('star', [0xb98cff, 0xffe45c, 0xffffff], 0, 10, 40, 0.55); break;
          case 'carrera': sp('dust', [0x7be3ff, 0xffffff], 0, -2, 0, 0.35); break;
          case 'relampago': sp('spark', [0xffe45c, 0xffffff, 0x7be3ff], 0, 0, 0, 0.3); break;
          case 'llamarada': sp('spark', [0xff4d2e, 0xff9a2e, 0xffe45c], 0, -16, -20, 0.45); break;
          case 'ola': sp('dust', [0x4cc9e8, 0xffffff, 0xbff3ff], 0, -10, 20, 0.4); break;
          case 'picada': sp('confetti', [0xffffff, 0xf3e3c4], 0, 8, 30, 0.7); break;
          default: sp('confetti', [0x5ddb43, 0x2f9a3a, 0xd9a05b], 0, 8, 30, 0.7); break;
        }
        break;
      }
      case 'steal': case 'slideball': this.spawn('spark', x, y, 0, -20, 60, 0.2); break;
    }
  }

  update(dt: number): void {
    for (let i = this.ps.length - 1; i >= 0; i--) {
      const o = this.ps[i];
      o.life -= dt; o.vy += o.g * dt;
      o.img.x += o.vx * dt; o.img.y += o.vy * dt;
      o.img.setAlpha(Math.max(0, Math.min(1, (o.life / o.max) * 2)));
      if (o.img.texture.key === 'ring') o.img.setScale(1 + (1 - o.life / o.max) * 1.8);
      if (o.life <= 0) { o.img.setVisible(false); this.pool.push(o.img); this.ps.splice(i, 1); }
    }
  }
  clear(): void { for (const o of this.ps) { o.img.setVisible(false); this.pool.push(o.img); } this.ps = []; }
}
