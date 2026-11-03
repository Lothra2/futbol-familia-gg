import Phaser from 'phaser';
import type { AnimMeta } from './anim';
import { LoopClock } from './anim';
import { PX, PY, depthAt, sx, sy } from '../core/proj';
import type { Match, Player } from '../core/state';
import type { Fx } from './Fx';

/** An atlas made by tools/nwc/nwc_gen.ts: 48 x 48 cells, `<anim>_<dir>` rows, the left half of the compass drawn by flipping the right half. */
export interface NesMeta { cell: [number, number]; pivot: [number, number]; cols: number; mirror: Record<string, string>; anims: Record<string, AnimMeta> }

/** The eight directions on the screen, clockwise from the right (screen y grows down). */
export const DIRS = ['right', 'down_right', 'down', 'down_left', 'left', 'up_left', 'up', 'up_right'] as const;
export type Dir = typeof DIRS[number];

/** Direction on the screen of a move (dx, dy) on the ground, with a little stickiness: it only changes when the new angle is 30 degrees past
 *  the middle of the old sector, so a player who runs at 22 degrees does not flicker between two drawings. */
export function dirOf(dx: number, dy: number, prev: number | null = null): number {
  const a = Math.atan2(dy * PY, dx * PX), step = Math.PI / 4;
  const i = ((Math.round(a / step) % 8) + 8) % 8;
  if (prev === null || prev === i) return i;
  let off = a - prev * step; off = Math.atan2(Math.sin(off), Math.cos(off));
  return Math.abs(off) > step / 2 + Math.PI / 12 ? i : prev;
}

/** What the player is doing, in the names of the forja atlas (the same for the family and the rivals; keepers add the keeper_ rows, Thor has his own). */
export function nesAnim(p: Player, m: Match | null, isThor: boolean): { name: string; loop: boolean; t: number } {
  const t = p.act ? p.act.t : p.stateT;
  const moving = Math.hypot(p.vx, p.vy) > 8, owns = !!m && m.ball.owner === p.id;
  const throwIn = !!m && m.phase === 'restart' && m.restart?.kind === 'throwin' && owns;
  if (isThor) {
    switch (p.state) {
      case 'dive': return { name: 'jump', loop: false, t };
      case 'hold': return { name: 'pickup', loop: false, t: 9 };
      case 'kick': return { name: 'fetch', loop: false, t };
      case 'celebrate': case 'special': return { name: 'celebrate', loop: true, t };
      case 'sad': return { name: 'lie', loop: true, t };
      case 'tumble': case 'stagger': case 'dizzy': case 'bump': return { name: 'hurt', loop: false, t };
      case 'slide': return { name: 'jump', loop: false, t };
      default: return moving ? { name: 'run', loop: true, t } : { name: owns ? 'wag' : 'idle', loop: true, t };
    }
  }
  const gk = p.role === 'gk';
  switch (p.state) {
    case 'kick': {
      const s = p.act?.sub;
      if (s === 'restart' && m?.restart?.kind === 'throwin') return { name: 'throw_in', loop: false, t };
      if (gk && s === 'restart') return { name: m?.restart?.kind === 'goalkick' ? 'keeper_punt' : 'keeper_throw', loop: false, t };
      const n = s === 'pass' || s === 'restart' ? 'pass' : s === 'chip' ? 'chip' : s === 'volley' ? 'volley' : s === 'header' ? 'header' : s === 'chilena' ? 'chilena' : 'shot';
      return { name: n, loop: false, t };
    }
    case 'special': return { name: 'shot', loop: false, t: Math.min(t, 0.25) };
    case 'slide': return { name: 'slide', loop: false, t };
    case 'bump': return { name: 'tackle', loop: false, t };
    case 'stagger': case 'dizzy': return { name: 'stagger', loop: false, t };
    case 'tumble': return { name: 'tumble', loop: false, t };
    case 'getup': return { name: 'fall_getup', loop: false, t: t + 0.3 };
    case 'celebrate': return { name: p.team === 0 ? 'dance' : 'celebrate', loop: true, t };
    case 'sad': return { name: 'sad', loop: true, t };
    case 'dive': return { name: gk ? 'keeper_dive' : 'jump', loop: false, t };
    case 'hold': return { name: gk ? 'keeper_catch' : 'idle', loop: false, t: 9 };
    default:
      if (throwIn) return { name: 'throw_in', loop: false, t: 0 };
      if (moving) return { name: owns ? 'run_ball' : 'run', loop: true, t };
      return { name: gk ? 'keeper_ready' : 'idle', loop: true, t };
  }
}

/** One footballer seen from above: the sprite from the state of the core in eight directions, a shadow on the ground, and for a human the
 *  number of his controller over the head (the "1" of Nintendo World Cup) and his stamina under the feet. */
export class NesPlayer {
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly shadow: Phaser.GameObjects.Image;
  readonly mark: Phaser.GameObjects.Image;
  readonly bar: Phaser.GameObjects.Graphics;
  private loops = new LoopClock();
  private dir = 0;
  private lastFrame = -1;
  private isThor: boolean;
  gold = false; private goldT = 0;
  /** A direction the scene imposes (the penalty shootout: the shooter from behind, the keeper facing us). */
  forceDir: number | null = null;

  constructor(private scene: Phaser.Scene, public p: Player, private key: string, private meta: NesMeta, private fx?: Fx) {
    this.isThor = p.art === 'thor';
    this.shadow = scene.add.image(0, 0, 'shadow').setOrigin(0.5, 0.5);
    this.sprite = scene.add.sprite(0, 0, key, 0).setOrigin(meta.pivot[0] / meta.cell[0], meta.pivot[1] / meta.cell[1]);
    this.mark = scene.add.image(0, 0, 'mark_1').setOrigin(0.5, 1).setVisible(false);
    this.bar = scene.add.graphics();
    this.dir = p.team === 0 ? 0 : 4;
  }
  destroy(): void { this.sprite.destroy(); this.shadow.destroy(); this.mark.destroy(); this.bar.destroy(); }

  /** Which way the drawing looks: where he runs, else where he aims, else at the ball (keepers and anybody standing). */
  private face(m: Match | null): number {
    const p = this.p;
    if (this.forceDir !== null) return this.forceDir;
    if (Math.hypot(p.vx, p.vy) > 20 && p.state !== 'tumble' && p.state !== 'stagger') return dirOf(p.vx, p.vy, this.dir);
    if (p.state === 'kick' || p.state === 'slide' || p.state === 'special' || p.state === 'dive') return dirOf(p.dirX || p.facing, p.dirY, this.dir);
    if (m && (p.state === 'idle' || p.state === 'run' || p.state === 'hold') && m.ball.owner !== p.id) {
      const dx = m.ball.x - p.x, dy = m.ball.y - p.y;
      if (Math.hypot(dx, dy) > 6) return dirOf(dx, dy, this.dir);
    }
    if (p.dirX || p.dirY) return dirOf(p.dirX, p.dirY, this.dir);
    return this.dir;
  }

  update(dt: number, m: Match | null, humanSlot: number | null, jColor: number): void {
    const p = this.p;
    this.dir = this.face(m);
    const want = DIRS[this.dir], mirrored = this.meta.mirror[want];
    const st = nesAnim(p, m, this.isThor);
    let key = `${st.name}_${mirrored ?? want}`;
    if (!this.meta.anims[key]) key = `idle_${mirrored ?? want}`;
    const a = this.meta.anims[key];
    const speed = Math.hypot(p.vx, p.vy);
    this.loops.ease(Math.max(0.6, Math.min(1.8, speed / 110)), dt);
    const frame = st.loop ? this.loops.frame(this.meta.anims, key, dt) : a.start + Math.min(a.frames - 1, Math.floor(Math.max(0, st.t) * a.fps));
    const x = Math.round(sx(p.x)), gy = Math.round(sy(p.y)), y = Math.round(sy(p.y, p.z));
    // a puff at the feet when a running stride lands (frames 0 and 4 of the cycle)
    if (st.loop && st.name.startsWith('run') && frame !== this.lastFrame && p.z < 2 && speed > 90 && this.fx) {
      const rel = frame - a.start;
      if (rel === 0 || rel === 4) this.fx.puff(x - Math.sign(p.vx || 1) * 5, gy, -p.vx * 0.15, p.state === 'sprint' ? 2 : 1);
    }
    this.lastFrame = frame;
    this.sprite.setFrame(frame).setPosition(x, y).setFlipX(!!mirrored).setDepth(depthAt(p.y));
    if (this.gold && p.state === 'celebrate') {
      this.goldT += dt;
      this.sprite.setTint(Math.sin(this.goldT * 14) > 0 ? 0xfff3b0 : 0xffd447);
      if (this.fx && Math.floor(this.goldT * 18) !== Math.floor((this.goldT - dt) * 18)) this.fx.sparkle(x + (Math.random() - 0.5) * 20, y - 10 - Math.random() * 26);
    } else if (this.goldT > 0) { this.goldT = 0; this.sprite.clearTint(); }
    const k = Math.max(0.5, 1 - p.z / 80);
    this.shadow.setPosition(x, gy).setScale(k * 1.15, 1).setDepth(depthAt(p.y) - 0.5);
    const mine = humanSlot !== null;
    this.mark.setVisible(mine);
    if (mine) this.mark.setTexture(`mark_${humanSlot + 1}`).setPosition(x, y - 38).setTint(jColor).setDepth(1000 + p.y);
    this.bar.clear();
    if (mine) {
      const w = 14, v = Math.max(0, Math.min(1, p.stamina / 100));
      this.bar.fillStyle(0x2a1b3d).fillRect(x - w / 2 - 1, gy + 3, w + 2, 4).fillStyle(p.sprintLock ? 0xff5e7e : v < 0.25 ? 0xffb23f : 0x5ddb43).fillRect(x - w / 2, gy + 4, Math.round(w * v), 2).setDepth(depthAt(p.y) - 0.4);
    }
  }
}
