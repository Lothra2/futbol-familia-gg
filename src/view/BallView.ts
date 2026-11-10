import Phaser from 'phaser';
import type { Ball, SpecialKind } from '../core/state';
import { T } from '../core/tuning';
import { PX, PY, PZ, depthAt, wx, sy } from '../core/proj';
import { FACING, PAL_BALL, PAL_HOT, paintBall, paintFlame, roll, rotate, tidy, type BallPal, type BallShape, type Mat3 } from './ballart';
import { KICK_MOVE, lookOf, lookOfPower, type Look } from './ballmoves';

/** The colour of the trail each power leaves (the afterimages of the Nekketsu super shots). */
const TRAIL: Record<SpecialKind, number> = { arcoiris: 0xff5e7e, burbuja: 0xbff3ff, canonazo: 0xffffff, estrellas: 0xffe45c, carrera: 0xffffff, relampago: 0xfff08a, llamarada: 0xff8a2a, ola: 0x5ab4ff, picada: 0xfff3b0, hojas: 0x5ddb43 };
const RAINBOW = [0xff5e7e, 0xffa040, 0xffe45c, 0x5ddb43, 0x5ab4ff, 0xb98cff];
/** The ball is `BALL_R` px of radius on screen: big against the footballers, like the one of the Nekketsu games. It is painted in a square of `SIZE` px. */
export const BALL_R = 9;
const SIZE = 64, KEY = 'ball_live';

/** Where a ball in the air touches the ground again (same gravity and drag as the core, no bounce). */
export function landingOf(b: Ball): { x: number; y: number; t: number } | null {
  if (b.z <= 0 && b.vz <= 0) return null;
  const g = T.gravity, t = (b.vz + Math.sqrt(b.vz * b.vz + 2 * g * Math.max(0, b.z))) / g;
  const k = (1 - Math.exp(-T.airDrag * t)) / T.airDrag;
  return { x: b.x + b.vx * k, y: b.y + b.vy * k, t };
}

/** How a ball that flies by itself looks from how fast it goes on the screen (px per second of the match): round up to `from`, then longer and
 *  thinner along its way (Nekketsu: a hard shot is an oval). Pure, for the tests. */
export function stretchOf(speed: number, extra = 0): { sx: number; sy: number } {
  const k = Math.max(0, Math.min(1, (speed - 340) / 340)), s = 1 + 0.42 * k + extra;
  return { sx: s, sy: 1 / Math.sqrt(s) };
}

/** The ball: a football painted every frame from what it is doing (ballart.ts), so it rolls the way it goes; its shadow on the ground (that is
 *  how you read its height, like the NES game), the cross where a high ball will land, and the move it is doing (ballmoves.ts): the oval of
 *  a hard shot, the banana of a shot with effect, the drill of the spinning kick, flat on a bounce, and the shape of each power while it
 *  flies (the bullet, the fireball, the spinning disc, the three stars...). */
export class BallView {
  readonly sprite: Phaser.GameObjects.Image;
  readonly shadow: Phaser.GameObjects.Image;
  private land: Phaser.GameObjects.Image;
  private fx: Phaser.GameObjects.Graphics;
  private tex: Phaser.Textures.CanvasTexture;
  private img: ImageData;
  /** How the ball is turned (it rolls with what it moves) and where it was last frame. */
  private rot: Mat3 = rotate(FACING, 1, 0, 0, 0.5);
  private last: { x: number; y: number; z: number; vz: number; touch: number } | null = null;
  private turns = 0;
  private sig = '';
  /** Flat for a moment after a bounce, wobbling after it hits something, and the kick that sent it (which, how long ago, where on the screen). */
  private squashT = 0; private wobT = 0; private kickKind = ''; private kickT = 9; private kickAt = { x: 0, y: 0 }; private kickHard = false;
  /** The last screen positions of the ball, for what it leaves behind. */
  private trail: { x: number; y: number }[] = [];
  /** Afterimages of the ball (Nekketsu): copies of the ball itself, fading, in the colours of the power. */
  private ghosts: Phaser.GameObjects.Image[] = [];
  /** The two other balls of the triple ball. */
  private twins: Phaser.GameObjects.Image[] = [];
  private wasKind: SpecialKind | null = null;
  private powerT = 0;
  private burst = 0;
  /** The replay shows the ball of the recording instead of the live one. */
  setBall(b: Ball): void { this.ball = b; }
  /** The ball hit something hard (a post, the hands of the keeper): it wobbles like jelly for a moment. */
  wobble(): void { this.wobT = 0.3; }
  constructor(scene: Phaser.Scene, private ball: Ball) {
    this.tex = scene.textures.exists(KEY) ? scene.textures.get(KEY) as Phaser.Textures.CanvasTexture : scene.textures.createCanvas(KEY, SIZE, SIZE)!;
    this.img = this.tex.getContext().createImageData(SIZE, SIZE);
    this.shadow = scene.add.image(0, 0, 'shadow').setOrigin(0.5, 0.5).setScale(0.9, 1);
    this.land = scene.add.image(0, 0, 'land').setOrigin(0.5, 0.5).setVisible(false).setAlpha(0.8);
    for (let i = 0; i < 6; i++) this.ghosts.push(scene.add.image(0, 0, KEY).setOrigin(0.5, 0.5).setVisible(false));
    for (let i = 0; i < 2; i++) this.twins.push(scene.add.image(0, 0, KEY).setOrigin(0.5, 0.5).setVisible(false));
    this.sprite = scene.add.image(0, 0, KEY).setOrigin(0.5, 0.5);
    this.fx = scene.add.graphics();
    this.paint({ r: BALL_R }, PAL_BALL);
  }

  private paint(shape: BallShape, pal: BallPal, flame?: { ux: number; uy: number; t: number; len: number }): void {
    // nothing changed since the last frame (a ball at rest): the picture stays
    const f = (v: number | undefined, d: number): string => (v ?? d).toFixed(2);
    const sig = `${this.turns}|${f(shape.r, 0)}|${f(shape.ux, 1)}|${f(shape.uy, 0)}|${f(shape.sx, 1)}|${f(shape.sy, 1)}|${f(shape.bend, 0)}|${f(shape.taper, 0)}|${shape.lobes ?? 0}|${f(shape.phase, 0)}|${pal.base}|${pal.patch}|${flame ? flame.t : ''}`;
    if (sig === this.sig) return;
    this.sig = sig;
    paintBall(this.img.data, SIZE, this.rot, shape, pal);
    if (flame) paintFlame(this.img.data, SIZE, shape.r, flame.ux, flame.uy, flame.t, flame.len);
    this.tex.getContext().putImageData(this.img, 0, 0);
    this.tex.refresh();
  }

  update(kind: SpecialKind | null = null, t = 0): void {
    const b = this.ball, F = 1 / 60;
    const x = Math.round(wx(b.x, b.y)), gy = Math.round(sy(b.y)), y = Math.round(sy(b.y, b.z) - BALL_R + 1);
    const k = Math.max(0.5, 0.95 - b.z / 120);
    // it rolls with the ground it covers; a jump of the picture (a restart, the replay) does not turn it
    const L = this.last;
    let landed = false, kicked = false;
    if (L) {
      const dx = (b.x - L.x) * PX, dy = (b.y - L.y) * PY, d = Math.hypot(dx, dy);
      if (d >= 40) this.trail.length = 0;
      else if (d > 0.05) {
        // faster than a third of the way from one patch to the next per frame it would seem to flicker instead of rolling
        const f = Math.min(1, 0.36 * BALL_R / d);
        this.rot = roll(this.rot, dx * f, dy * f, BALL_R); this.turns++;
        if (this.turns % 240 === 0) this.rot = tidy(this.rot);
      }
      landed = L.vz < -70 && b.vz >= 0 && b.z < 3 && b.state === 'free';
      kicked = b.state === 'free' && b.lastTouch.t !== L.touch;
    }
    this.last = { x: b.x, y: b.y, z: b.z, vz: b.vz, touch: b.lastTouch.t };
    if (landed) this.squashT = 0.1;
    if (kicked) { this.kickKind = b.kick && b.kick.t === b.lastTouch.t ? b.kick.kind : ''; this.kickT = 0; this.kickAt = { x, y }; this.kickHard = Math.hypot(b.vx, b.vy) > 300; }
    this.squashT = Math.max(0, this.squashT - F); this.wobT = Math.max(0, this.wobT - F); this.kickT += F;
    this.trail.unshift({ x, y }); if (this.trail.length > 15) this.trail.length = 15;

    this.sprite.setPosition(x, y).setDepth(depthAt(b.y) + 0.5);
    this.shadow.setPosition(x, gy).setScale(k * 1.2, 1).setDepth(depthAt(b.y) - 0.6);
    const l = b.z > 18 && b.state === 'free' && !kind ? landingOf(b) : null;
    this.land.setVisible(!!l && Math.floor(t * 8) % 2 === 0);
    if (l) this.land.setPosition(Math.round(wx(l.x, l.y)), Math.round(sy(l.y))).setDepth(depthAt(l.y) - 0.7);
    const g = this.fx;
    g.clear().setDepth(depthAt(b.y) + 0.6);

    // ------------------------------------------------------------------ what the ball is doing
    let look: Look, ux = 1, uy = 0, tint = 0xffffff;
    if (kind) {
      // a power (Nekketsu): the ball takes its shape
      if (this.wasKind !== kind) { this.wasKind = kind; this.burst = 0.22; this.powerT = 0; this.trail.length = 1; }
      this.powerT += F;
      const q = this.trail[Math.min(2, this.trail.length - 1)], n = Math.hypot(x - q.x, y - q.y);
      if (n >= 0.5) { ux = (x - q.x) / n; uy = (y - q.y) / n; }
      const falling = this.trail.length > 3 && y > this.trail[3].y + 3;
      look = lookOfPower(kind, BALL_R, ux, uy, t, this.powerT, falling);
      tint = TRAIL[kind];
    } else {
      this.wasKind = null;
      const vx = b.vx * PX, vy = b.vy * PY - b.vz * PZ, sp = Math.hypot(vx, vy), free = b.state === 'free';
      if (sp > 1) { ux = vx / sp; uy = vy / sp; }
      const km = KICK_MOVE[this.kickKind];
      if (this.squashT > 0) { look = lookOf('tortilla', BALL_R, 0, 1, t); this.sprite.y = y + 2; }
      else if (this.wobT > 0) { look = lookOf('gelatina', BALL_R, ux, uy, t, 0, this.wobT / 0.3); look.pals = [PAL_BALL]; look.ghosts = 0; }
      else if (free && km && this.kickT < km.dur && sp >= km.min) look = lookOf(km.move, BALL_R, ux, uy, t, this.kickT);
      else if (free && Math.abs(b.spin) > 0.2 && sp > 150 && Math.abs(ux) > 0.3) look = lookOf('banana', BALL_R, ux, uy, t, 0, Math.sign(b.spin) * Math.sign(ux) * Math.min(1, Math.abs(b.spin) / 1.1));
      else if (free && sp > 1) {
        // an oval along its way when it goes hard, more so for a moment right off the boot
        const st = stretchOf(sp, this.kickHard && this.kickT < 0.16 ? 0.3 * (1 - this.kickT / 0.16) : 0);
        look = lookOf('redondo', BALL_R, ux, uy, t);
        if (st.sx > 1.03) { look.move = 'ovalo'; look.shape = { r: BALL_R, ux, uy, sx: st.sx, sy: st.sy }; }
        // a shot loaded to the full comes off the boot white hot
        if (this.kickKind === 'hard' && this.kickT < 0.45 && sp > 400) { look.pals = [PAL_HOT.blanco, PAL_BALL]; look.ghosts = 3; }
      } else look = lookOf('redondo', BALL_R, ux, uy, t);
    }
    if (look.spin) { this.rot = rotate(this.rot, 0, 0, 1, look.spin); this.turns++; }
    this.paint(look.shape, look.pals[Math.floor(t * 20) % look.pals.length], look.flame ? { ux, uy, t: Math.floor(t * 30) / 30, len: look.flame } : undefined);

    this.ghosts.forEach((o, i) => {
      const q = this.trail[(i + 1) * 2];
      if (!q || i >= look.ghosts) { o.setVisible(false); return; }
      o.setVisible(true).setPosition(q.x, q.y).setScale(1 - i * 0.09).setAlpha(0.62 - i * 0.1).setTint(tint).setDepth(depthAt(b.y) + 0.4 - i * 0.01);
    });
    // the triple ball: two more balls weave round the real one
    const px = -uy, py = ux;
    this.twins.forEach((o, i) => {
      if (!look.twins) { o.setVisible(false); return; }
      const off = Math.sin(t * 17 + i * Math.PI) * 16, back = 5 + i * 5;
      o.setVisible(true).setPosition(Math.round(x + px * off - ux * back), Math.round(y + py * off * 0.6 - uy * back)).setAlpha(0.92).setTint(i ? 0xffe9a0 : 0xe6d0ff).setDepth(depthAt(b.y) + 0.45);
    });

    // ------------------------------------------------------------------ what is drawn round it
    if (!kind && this.kickHard && this.kickT < 0.1) this.star(g, this.kickAt.x, this.kickAt.y, 6 + this.kickT * 110, 0xffffff, 0xffe45c);
    if (kind && this.burst > 0) {
      // the star of impact at the kick: eight spikes in white and the colour of the power
      const q = this.trail[this.trail.length - 1];
      this.star(g, q.x, q.y, 26 * (1 - this.burst / 0.22) + 6, 0xffffff, TRAIL[kind]);
      this.burst = Math.max(0, this.burst - F);
    }
    const r = look.shape.r, tr = this.trail;
    const dot = (cx: number, cy: number, s: number, col: number, a = 1): void => { g.fillStyle(col, Math.max(0, a)).fillRect(Math.round(cx - s / 2), Math.round(cy - s / 2), s, s); };
    switch (look.move) {
      case 'bala': case 'carrera': case 'gota': case 'aguja': {
        // lines of speed behind it, and for the bullet the air it breaks in front
        const n = look.move === 'gota' ? 3 : 5, sxk = look.shape.sx ?? 1;
        for (let i = 0; i < n; i++) {
          const o = (i - (n - 1) / 2) * 4, len = (look.move === 'gota' ? 8 : 16) + ((Math.floor(t * 30) + i * 7) % 14), bx = x - ux * (r * sxk * 0.75) + px * o, by = y - uy * (r * sxk * 0.75) + py * o;
          g.lineStyle(i === (n - 1) / 2 ? 2 : 1, i % 2 ? (look.move === 'gota' ? 0xffffff : 0xffe45c) : 0xffffff, 0.95).lineBetween(bx, by, bx - ux * len, by - uy * len);
        }
        if (look.move === 'bala') for (const s of [-1, 1]) g.lineStyle(2, 0xffffff, 0.9).lineBetween(x + ux * (r * 2.3) + px * s * 3, y + uy * (r * 2.3) + py * s * 3, x + ux * (r * 1.2) + px * s * 13, y + uy * (r * 1.2) + py * s * 13);
        if (look.move === 'carrera') for (let i = 3; i < tr.length; i += 3) dot(tr[i].x, gy + 2 - (i % 2) * 3, 3, 0xe6dccf, 1 - i / 16);
        break;
      }
      case 'cometa':
        // embers that stay behind
        for (let i = 3; i < tr.length; i += 2) { const q = tr[i], j = Math.sin(t * 30 + i * 2.1) * 4; dot(q.x + j, q.y - i * 0.6 + j * 0.5, i < 8 ? 3 : 2, i % 4 === 1 ? 0xffe45c : 0xff5e1a, 1 - i / 18); }
        break;
      case 'rayo': {
        // the bolt it leaves: jagged, yellow with a white core
        const pts = tr.filter((_, i) => i % 2 === 0).map((q, i) => ({ x: q.x + (i ? Math.sin(i * 12.9898 + Math.floor(t * 20) * 3.1) * 5 : 0), y: q.y + (i ? Math.cos(i * 78.233 + Math.floor(t * 20) * 1.7) * 5 : 0) }));
        for (const [w, col] of [[4, 0xffd447], [2, 0xffffff]] as const) { g.lineStyle(w, col, 1).beginPath().moveTo(pts[0].x, pts[0].y); for (const q of pts.slice(1)) g.lineTo(q.x, q.y); g.strokePath(); }
        if (Math.floor(t * 20) % 3 === 0) this.star(g, x, y, r + 8, 0xffffff, 0xfff08a);
        break;
      }
      case 'gelatina':
        if (!kind) break;
        // it skims the grass: foam under it and drops that jump behind
        for (let i = 0; i < 4; i++) dot(x - 9 + i * 6, gy + 1 - (i % 2), 4, i % 2 ? 0xffffff : 0x7bc8ff);
        for (let i = 2; i < tr.length; i += 2) { const q = tr[i], h = Math.abs(Math.sin(t * 16 + i)) * (10 - i * 0.5); dot(q.x, q.y + 6 - h, 3, 0xd8f0ff, 1 - i / 17); dot(q.x + 4, q.y + 8 - h * 0.5, 2, 0x5ab4ff, 1 - i / 17); }
        break;
      case 'bumeran':
        for (let i = 2; i < tr.length; i += 3) dot(tr[i].x, tr[i].y, 3, i % 2 ? 0xffffff : 0xfff3b0, 1 - i / 16);
        break;
      case 'disco':
        if (kind === 'arcoiris') {
          // the ribbon of the rainbow behind the disc
          for (let c = 0; c < RAINBOW.length; c++) {
            const o = (c - 2.5) * 2;
            g.lineStyle(2, RAINBOW[c], 0.95).beginPath();
            tr.forEach((q, i) => { const n = tr[Math.min(tr.length - 1, i + 1)], dx = q.x - n.x, dy = q.y - n.y, m = Math.hypot(dx, dy) || 1; const X = q.x - (dy / m) * o, Y = q.y + (dx / m) * o; if (i) g.lineTo(X, Y); else g.moveTo(X, Y); });
            g.strokePath();
          }
        } else for (let i = 2; i < tr.length; i += 3) dot(tr[i].x, tr[i].y, 2, 0xffffff, 0.9 - i / 14);
        break;
      case 'estrella': case 'triple':
        for (let i = 0; i < 5; i++) {
          const a = t * 10 + i * 1.257, cx = Math.round(x + Math.cos(a) * (r + 7)), cy = Math.round(y + Math.sin(a) * (r + 7) * 0.6);
          g.fillStyle(i % 2 ? 0xffffff : 0xffe45c, 1).fillRect(cx - 2, cy, 5, 1).fillRect(cx, cy - 2, 1, 5);
        }
        break;
      case 'sierra':
        // the leaves it tears off
        for (let i = 0; i < 5; i++) {
          const a = -t * 9 + i * 1.257, rad = r + 6 + (i % 2) * 3, cx = Math.round(x + Math.cos(a) * rad), cy = Math.round(y + Math.sin(a) * rad * 0.6);
          g.fillStyle(0x2a9a3a, 1).fillRect(cx - 2, cy - 1, 5, 3).fillStyle(0x9be07a, 1).fillRect(cx - 1, cy - 2, 3, 1).fillRect(cx - 1, cy, 2, 1);
        }
        for (let i = 4; i < tr.length; i += 3) dot(tr[i].x + Math.sin(t * 12 + i) * 4, tr[i].y + Math.cos(t * 9 + i) * 3, 3, i % 2 ? 0x5ddb43 : 0x2a9a3a, 1 - i / 17);
        break;
      case 'taladro': {
        // the rings that turn round the drill, and the thread it leaves in the air
        const sxk = look.shape.sx ?? 1;
        for (let i = 0; i < 3; i++) {
          const a = ((t * 46 + i * 9) % 27) - 15, w = (r * 0.95) * (1 - Math.abs(a) / 26), cx = x - ux * a, cy = y - uy * a;
          if (Math.abs(a) < r * sxk + 5) g.lineStyle(2, i % 2 ? 0xffe45c : 0xffffff, 0.95).lineBetween(cx + px * w, cy + py * w, cx - px * w, cy - py * w);
        }
        for (let i = 2; i < tr.length; i += 1) { const q = tr[i], o = Math.sin(t * 40 - i * 1.1) * 6; dot(q.x + px * o, q.y + py * o, 2, i % 2 ? 0xffffff : 0xffe45c, 1 - i / 15); }
        break;
      }
      case 'burbuja': {
        // the bubble round the ball wobbles, and little ones stay behind
        const w = Math.sin(t * 9), rx = r + 6 + w * 1.5, ry = r + 6 - w * 1.5;
        g.fillStyle(0xbff3ff, 0.25).fillEllipse(x, y, rx * 2, ry * 2).lineStyle(1, 0xffffff, 0.95).strokeEllipse(x, y, rx * 2, ry * 2);
        g.fillStyle(0xffffff, 0.95).fillRect(x - 9, y - 10, 3, 2).fillRect(x - 11, y - 7, 2, 2);
        for (let i = 4; i < tr.length; i += 4) { const q = tr[i]; g.lineStyle(1, 0xffffff, 0.8 - i / 24).strokeCircle(q.x + Math.sin(t * 6 + i) * 3, q.y - i * 0.5, 2 + (i % 3)); }
        break;
      }
      default: break;
    }
  }

  /** The star of an impact (Nekketsu): eight spikes, long and short by turns. */
  private star(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, c1: number, c2: number): void {
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + 0.2, rr = i % 2 ? r * 0.7 : r; g.lineStyle(i % 2 ? 2 : 3, i % 2 ? c1 : c2, 1).lineBetween(x + Math.cos(a) * rr * 0.35, y + Math.sin(a) * rr * 0.35, x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  }
}
