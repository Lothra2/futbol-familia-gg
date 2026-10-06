import Phaser from 'phaser';
import { pitchScreenTop } from '../../core/field';
import { Stadium, type StadiumId, type TimeOfDay } from '../Stadium';
import { LoopClock } from '../anim';
import { resolvePose, type Atlas } from '../poses';
import type { SpriteMeta } from '../PlayerView';
import { services } from '../../app/services';

const CAST = ['mama', 'sophie', 'thor', 'alana', 'juandi', 'papa'] as const;
type Mode = 'idle' | 'dribble' | 'cheer';
interface Actor { id: string; sprite: Phaser.GameObjects.Sprite; shadow: Phaser.GameObjects.Image; atlas: Atlas; clock: LoopClock; x: number; y: number; hx: number; hy: number; dir: 1 | -1; mode: Mode; t: number }

/**
 * The background of every menu: a live stadium with the family passing the ball to each other, like a warm-up before the match.
 * It is purely decorative (no core, no input): the DOM screens sit on top.
 */
export class MenuScene extends Phaser.Scene {
  private stadium!: Stadium;
  private actors: Actor[] = [];
  private ball!: Phaser.GameObjects.Image;
  private ballShadow!: Phaser.GameObjects.Image;
  private holder = 0;
  private flight: { from: [number, number]; to: [number, number]; t: number; dur: number; to_i: number } | null = null;
  private t = 0;
  private id: StadiumId = 'volcan';
  private time_: TimeOfDay | undefined;
  private rnd = 11;
  private sc = 1;

  constructor() { super('Menu'); }

  init(data: { stadium?: StadiumId; time?: TimeOfDay }): void { this.id = data?.stadium ?? 'volcan'; this.time_ = data?.time; }

  private r(): number { this.rnd = (this.rnd * 1664525 + 1013904223) >>> 0; return this.rnd / 4294967296; }

  create(): void {
    this.sc = 1;
    this.actors = []; this.t = 0; this.flight = null; this.holder = 0;
    this.stadium = new Stadium(this, this.id, this.time_, 'auto');
    for (const id of CAST) {
      const meta = this.cache.json.get(`${id}_meta`) as SpriteMeta | undefined;
      if (!meta || !this.textures.exists(id)) continue;
      const shadow = this.add.image(0, 0, 'shadow').setOrigin(0.5).setScale(1);
      const sprite = this.add.sprite(0, 0, id, 0).setOrigin(meta.pivot[0] / meta.cell[0], meta.pivot[1] / meta.cell[1]).setScale(this.sc);
      this.actors.push({ id, sprite, shadow, atlas: meta.anims, clock: new LoopClock(), x: 0, y: 0, hx: 0, hy: 0, dir: 1, mode: 'idle', t: this.r() * 3 });
    }
    this.ballShadow = this.add.image(0, 0, 'shadow').setOrigin(0.5).setScale(1);
    this.ball = this.add.image(0, 0, 'ball', 0).setOrigin(0.5, 1).setScale(this.sc);
    services.audio?.crowd(false); services.audio?.music('menu');
    this.scale.on('resize', this.layout, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.layout, this));
    this.layout();
    this.actors.forEach((a, i) => { a.x = a.hx; a.y = a.hy; a.dir = i % 2 ? -1 : 1; });
    if (this.actors[0]) this.actors[0].mode = 'dribble';
  }

  private layout(): void {
    const w = this.scale.width, h = this.scale.height;
    this.cameras.main.setSize(w, h);
    this.stadium.layout(w, h);
    // the cast stands in a loose line across the pitch, more rows when there is room
    const n = this.actors.length, span = Math.min(w - 90, 520), top = pitchScreenTop(h);
    const cx = 480;
    this.actors.forEach((a, i) => {
      a.hx = Math.round(cx - span / 2 + (span * (i + 0.5)) / n);
      a.hy = 70 + (i % 2) * 34 + ((i * 7) % 3) * 6;
      void top;
    });
    this.cameras.main.setScroll(Math.round(cx - w / 2), 0);
    this.stadium.scroll(Math.round(cx - w / 2));
  }

  update(_t: number, delta: number): void {
    const dt = Math.min(0.1, delta / 1000);
    this.t += dt;
    const w = this.scale.width, h = this.scale.height, top = pitchScreenTop(h);
    const camX = Math.round(480 - w / 2 + Math.sin(this.t * 0.18) * 36);
    this.cameras.main.setScroll(camX, 0); this.stadium.scroll(camX);
    this.stadium.update(delta, 0);
    const a0 = this.actors[this.holder];
    // the ball: at the feet of the one who dribbles, or in the air towards the next one
    if (this.flight) {
      const f = this.flight; f.t += dt;
      const u = Math.min(1, f.t / f.dur), x = f.from[0] + (f.to[0] - f.from[0]) * u, y = f.from[1] + (f.to[1] - f.from[1]) * u, z = Math.sin(u * Math.PI) * 26;
      this.ball.setPosition(Math.round(x), Math.round(top + y - z)).setFrame(Math.floor(this.t * 14) % 4).setDepth(200 + y);
      this.ballShadow.setPosition(Math.round(x), Math.round(top + y)).setScale(Math.max(0.5, 1 - z / 60), 1).setDepth(199);
      if (u >= 1) { this.holder = f.to_i; this.actors[this.holder].mode = 'dribble'; this.actors[this.holder].t = 0; this.flight = null; }
    } else if (a0) {
      this.ball.setPosition(Math.round(a0.x + a0.dir * 10), Math.round(top + a0.y)).setFrame(Math.floor(this.t * 10) % 4).setDepth(200 + a0.y + 1);
      this.ballShadow.setPosition(Math.round(a0.x + a0.dir * 10), Math.round(top + a0.y)).setScale(1, 1).setDepth(199);
    }
    for (let i = 0; i < this.actors.length; i++) {
      const a = this.actors[i];
      a.t += dt;
      if (i === this.holder && !this.flight) {
        // a short dribble to the side, then the pass
        a.mode = 'dribble';
        const wob = Math.sin(a.t * 3) * 26;
        const tx = a.hx + wob, ty = a.hy + Math.cos(a.t * 2.2) * 10;
        const dx = tx - a.x, dy = ty - a.y, d = Math.hypot(dx, dy);
        const sp = Math.min(d * 6, 70);
        if (d > 1) { a.x += (dx / d) * sp * dt; a.y += (dy / d) * sp * dt; if (Math.abs(dx) > 2) a.dir = dx > 0 ? 1 : -1; }
        if (a.t > 1.8 + (this.holder % 3) * 0.4) {
          let j = Math.floor(this.r() * this.actors.length); if (j === i) j = (j + 1) % this.actors.length;
          const to = this.actors[j];
          a.dir = to.x >= a.x ? 1 : -1; to.dir = a.x >= to.x ? 1 : -1;
          this.flight = { from: [a.x + a.dir * 10, a.y], to: [to.x + to.dir * 6, to.y], t: 0, dur: 0.8 + Math.abs(to.x - a.x) / 500, to_i: j };
          a.mode = 'idle'; a.t = 0;
        }
      } else {
        a.mode = 'idle';
        const dx = a.hx - a.x, dy = a.hy - a.y; a.x += dx * Math.min(1, dt * 3); a.y += dy * Math.min(1, dt * 3);
      }
      const moving = a.mode === 'dribble' && Math.hypot(a.hx - a.x, a.hy - a.y) > 3 || (i === this.holder && !this.flight);
      const pose = moving ? 'run' : 'idle';
      const name = resolvePose(a.atlas, pose);
      const anim = a.atlas[name];
      const frame = anim.frames > 1 ? a.clock.frame(a.atlas, name, dt) : anim.start;
      a.clock.ease(1, dt);
      a.sprite.setFrame(frame).setPosition(Math.round(a.x), Math.round(top + a.y)).setFlipX(a.dir < 0).setDepth(200 + a.y);
      a.shadow.setPosition(Math.round(a.x), Math.round(top + a.y)).setDepth(199);
    }
  }
}
