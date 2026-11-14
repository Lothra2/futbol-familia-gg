import Phaser from 'phaser';
import { AREA_BIG, AREA_SMALL, CENTER, GOAL, PENALTY_X, PITCH } from '../core/field';
import { BOUNDS, MARGIN, PX, PY, PZ, sx, sy, wx } from '../core/proj';
import { WORLDS, rng, type World, type WorldId } from './worlds';
import { drawFan, makeFans, poseOf, ROW_H, SEAT, type Fan, type FanKind } from './stadium/fans';
import { drawText, textWidth } from './stadium/font5';

export type TimeOfDay = 'day' | 'sunset' | 'night';
type Ctx = CanvasRenderingContext2D;
const W = Math.ceil(BOUNDS.x1 - BOUNDS.x0), H = Math.ceil(BOUNDS.y1 - BOUNDS.y0);
/** Texture x and y of a world point on the ground. */
const X = (x: number): number => Math.round(sx(x) - BOUNDS.x0);
const Y = (y: number): number => Math.round(sy(y) - BOUNDS.y0);
const ROWS = 4;
const MIDY = (GOAL.y0 + GOAL.y1) / 2;
/** Where the stands sit (world y): the boards at the foot, then the rows of fans going up. */
const BOARD_Y0 = -22, BOARD_Y1 = -8, STAND_Y1 = BOARD_Y0 - 2;
const GRADE: Record<TimeOfDay, number> = { day: 0xffffff, sunset: 0xffdcc0, night: 0xa0a8e0 };
const MIX: Record<WorldId, Partial<Record<FanKind, number>>> = { volcan: { dragon: 0.7, human: 0.3 }, bosque: { mapache: 0.7, human: 0.3 }, arrecife: { tiburon: 0.7, human: 0.3 }, nubes: { buho: 0.7, human: 0.3 } };

/** A fill of every other pixel in a checker (the NES dither), anchored to the texture so the bands line up. */
const checker = (c: Ctx, col: string): CanvasPattern | string => {
  const t = document.createElement('canvas'); t.width = 2; t.height = 2;
  const k = t.getContext('2d')!; k.fillStyle = col; k.fillRect(0, 0, 1, 1); k.fillRect(1, 1, 1, 1);
  return c.createPattern(t, 'repeat') ?? col;
};
const px = (c: Ctx, col: string, x: number, y: number, w = 1, h = 1): void => { c.fillStyle = col; c.fillRect(x, y, w, h); };

/** The pitch seen from above like Nintendo World Cup, one per kingdom: striped ground with patches and little things on it, the lines from the
 *  same constants the rules use, the goals with their nets, the boards and a live crowd above the far touchline, and the light of the hour. */
export class TopPitch {
  readonly world: World;
  readonly time: TimeOfDay;
  private img: Phaser.GameObjects.Image;
  private lineG: Phaser.GameObjects.Graphics;
  private netG: Phaser.GameObjects.Graphics;
  private frameG: Phaser.GameObjects.Graphics;
  private crowd: Phaser.GameObjects.Image;
  private grade: Phaser.GameObjects.Rectangle;
  private lights: Phaser.GameObjects.Graphics;
  private fans: Fan[];
  private cheerT = 0; private clock = 0; private k = -1; private state: 'idle' | 'cheer' = 'idle';
  /** Test hooks. */
  get crowdState(): string { return this.state; }
  get theme(): { name: string } { return { name: this.world.name }; }

  constructor(private scene: Phaser.Scene, readonly id: WorldId = 'volcan', time?: TimeOfDay) {
    this.world = WORLDS[id]; this.time = time ?? this.world.time;
    scene.cameras.main.setBackgroundColor(this.world.out);
    const key = `pitch_${id}`;
    if (!scene.textures.exists(key)) this.bake(key);
    this.img = scene.add.image(BOUNDS.x0, BOUNDS.y0, key).setOrigin(0, 0).setDepth(1);
    this.fans = makeFans(31 + id.length, Math.floor(W / SEAT), ROWS, MIX[id]);
    for (const st of ['idle', 'cheer'] as const) for (let k = 0; k < 4; k++) this.bakeCrowd(st, k);
    this.crowd = scene.add.image(BOUNDS.x0, Math.round(sy(STAND_Y1)) - ROWS * ROW_H, `crowd_${id}_idle_0`).setOrigin(0, 0).setDepth(2);
    this.lineG = scene.add.graphics().setDepth(3);
    this.netG = scene.add.graphics().setDepth(150);
    this.frameG = scene.add.graphics().setDepth(200 + GOAL.y1 + 0.5);
    this.lights = scene.add.graphics().setDepth(3550).setBlendMode(Phaser.BlendModes.ADD);
    this.grade = scene.add.rectangle(0, 0, 10, 10, GRADE[this.time]).setOrigin(0, 0).setDepth(3500).setScrollFactor(0).setBlendMode(Phaser.BlendModes.MULTIPLY).setVisible(this.time !== 'day');
    if (this.time === 'night') this.drawLights();
  }

  layout(w: number, h: number): void { this.grade.setSize(w, h); }

  /** The crowd cheers for a while (a goal) or gasps for a moment (a save, a post, a special). */
  goal(): void { this.cheerT = 4.5; }
  gasp(): void { this.cheerT = Math.max(this.cheerT, 1.2); }
  /** A person celebrates with a gesture: the fans keep cheering. */
  cheer(big = false): void { this.cheerT = Math.max(this.cheerT, big ? 2.2 : 1.4); }

  update(dt: number): void {
    this.drawLines();
    this.clock += dt; this.cheerT = Math.max(0, this.cheerT - dt);
    this.state = this.cheerT > 0 ? 'cheer' : 'idle';
    const k = Math.floor(this.clock * (this.state === 'cheer' ? 8 : 2)) % 4;
    if (k !== this.k || this.crowd.texture.key.indexOf(this.state) < 0) { this.k = k; this.crowd.setTexture(`crowd_${this.id}_${this.state}_${k}`); }
  }

  destroy(): void { for (const o of [this.img, this.crowd, this.grade, this.lights, this.lineG, this.netG, this.frameG]) o.destroy(); }

  // ------------------------------------------------------------------ baking
  private bake(key: string): void {
    const t = this.scene.textures.createCanvas(key, W, H)!, c = t.getContext(); c.imageSmoothingEnabled = false;
    const w = this.world, r = rng(7 + key.length * 13);
    // the ground (Nintendo World Cup): bands of 16 px, one of the base colour and the next dithered with a darker tone in a checker
    const B = 16;
    px(c, w.stripe[0], 0, 0, W, H);
    const dark = checker(c, w.stripe[1]);
    for (let y = B; y < H; y += B * 2) { c.fillStyle = dark; c.fillRect(0, y, W, B); }
    // the patches: big blobs of a lighter tone with edges stepped on an 8 px grid, and a one-cell dithered border, the way the NES draws them
    const blobs: { x: number; y: number; r: number }[] = [];
    const n = Math.round((W * H) / (w.patchSize * w.patchSize * 9) * w.patchCover * 3);
    for (let i = 0; i < n; i++) blobs.push({ x: r() * W, y: r() * H, r: w.patchSize * (0.7 + r() * 1.1) });
    const G = 8, cols = Math.ceil(W / G), rows = Math.ceil(H / G), cell = new Uint8Array(cols * rows);
    for (let gy = 0; gy < rows; gy++) for (let gx = 0; gx < cols; gx++) {
      let v = 0;
      for (const b of blobs) { const d = Math.hypot((gx * G - b.x) / 1.8, gy * G - b.y); if (d < b.r) v += 1 - d / b.r; }
      cell[gy * cols + gx] = v > 0.5 ? 2 : v > 0.36 ? 1 : 0;
    }
    const edge = checker(c, w.patch[1]);
    for (let gy = 0; gy < rows; gy++) for (let gx = 0; gx < cols; gx++) {
      const k = cell[gy * cols + gx];
      if (k === 2) px(c, w.patch[0], gx * G, gy * G, G, G);
      else if (k === 1) { c.fillStyle = edge; c.fillRect(gx * G, gy * G, G, G); }
    }
    // outside the lines: the ground darkens, and the track behind the goals
    c.fillStyle = 'rgba(20,30,20,0.16)';
    c.fillRect(0, 0, W, Y(0)); c.fillRect(0, Y(PITCH.d), W, H - Y(PITCH.d)); c.fillRect(0, Y(0), X(0), Y(PITCH.d) - Y(0)); c.fillRect(X(PITCH.w), Y(0), W - X(PITCH.w), Y(PITCH.d) - Y(0));
    for (const [a, b] of [[-MARGIN.x, -40], [PITCH.w + 40, PITCH.w + MARGIN.x]] as const) {
      px(c, w.track, X(a), Y(-6), X(b) - X(a), Y(PITCH.d + 6) - Y(-6));
      c.fillStyle = 'rgba(255,255,255,0.35)';
      for (let i = 1; i < 4; i++) c.fillRect(X(a) + Math.round(((X(b) - X(a)) * i) / 4), Y(-6), 1, Y(PITCH.d + 6) - Y(-6));
    }
    this.decorate(c, r);
    this.props(c, r);
    this.stands(c);
    t.refresh();
  }

  /** The edge of the pitch of each kingdom: bushes in flower, dry grass, rocks, reeds (assets/deco, from LPC Revised), along the strip
   *  between the near touchline and the end of the ground. They are painted on the ground, never inside the lines, so nobody is hidden. */
  private props(c: Ctx, r: () => number): void {
    const meta = this.scene.cache.json.get('deco_meta') as Record<string, number[][]> | undefined, set = meta?.[this.id];
    if (!set?.length || !this.scene.textures.exists('deco')) return;
    const src = this.scene.textures.get('deco').getSourceImage() as CanvasImageSource, y0 = Y(PITCH.d) + 4, y1 = Y(PITCH.d + MARGIN.bottom) - 1;
    let x = X(-MARGIN.x) + 6 + r() * 20;
    while (x < X(PITCH.w + MARGIN.x) - 20) {
      const [bx, by, bw, bh] = set[Math.floor(r() * set.length)];
      // two times out of three a piece, alone or with a smaller friend; its foot anywhere the strip lets it be whole
      if (r() < 0.68 && y0 + bh <= y1) {
        const fy = Math.round(y0 + bh + r() * (y1 - y0 - bh));
        px(c, 'rgba(0,0,0,0.18)', Math.round(x) + 1, fy - 1, bw - 2, 2);
        c.drawImage(src, bx, by, bw, bh, Math.round(x), fy - bh, bw, bh);
      }
      x += bw + 14 + r() * 46;
    }
  }

  /** Little things on the ground in small clusters, never on the lines: the dotted flower rings of the NES grass pitch, little white tufts,
   *  and each kingdom its own (pebbles, shells, sparkles). */
  private decorate(c: Ctx, r: () => number): void {
    const d = this.world.deco, clusters = Math.round((W * H) / 10000 * d.density / 3);
    const ring = (x: number, y: number, col: string): void => {
      // a ring of 7 x 5 px made of dots with a dot in the middle (the "flowers" of Nintendo World Cup)
      for (const [dx, dy] of [[-1, -2], [1, -2], [-3, -1], [3, -1], [-3, 1], [3, 1], [-1, 2], [1, 2], [0, 0]]) px(c, col, x + dx, y + dy);
    };
    for (let i = 0; i < clusters; i++) {
      const cx = r() * W, cy = Y(-4) + r() * (Y(PITCH.d + 20) - Y(-4)), m = 2 + Math.floor(r() * 4);
      for (let j = 0; j < m; j++) {
        const x = Math.round(cx + (j % 3) * 9 + (r() - 0.5) * 4), y = Math.round(cy + Math.floor(j / 3) * 7 + (r() - 0.5) * 3), col = d.colors[Math.floor(r() * d.colors.length)];
        if (d.kind === 'flores') ring(x, y, col);
        else if (d.kind === 'piedras') { px(c, d.colors[0], x, y, 3, 2); px(c, d.colors[1], x, y, 1, 1); }
        else if (d.kind === 'conchas') { px(c, col, x, y, 3, 1); px(c, col, x + 1, y - 1); px(c, 'rgba(0,0,0,0.25)', x, y + 1, 3, 1); }
        else if (d.kind === 'brillos') { px(c, col, x, y - 1, 1, 3); px(c, col, x - 1, y, 3, 1); }
        else { px(c, col, x, y, 2, 1); px(c, col, x + 1, y + 1, 2, 1); }
      }
    }
    // little white tufts of grass (the hooks scattered on the NES pitch)
    for (let i = 0; i < Math.round((W * H) / 9000); i++) {
      const x = Math.round(r() * W), y = Math.round(Y(-4) + r() * (Y(PITCH.d + 20) - Y(-4)));
      px(c, 'rgba(255,255,255,0.75)', x, y, 1, 3); px(c, 'rgba(255,255,255,0.75)', x - 1, y + 3, 1, 1);
    }
  }

  /** The white lines and the goals, drawn every frame with the perspective of Nintendo World Cup (core/proj.ts wx): the lines that run up the
   *  pitch lean and open towards the bottom of the screen. From the same constants the rules use. */
  private drawLines(): void {
    const g = this.lineG, col = Phaser.Display.Color.HexStringToColor(this.world.line).color; g.clear().lineStyle(2, col, 1);
    const P = (x: number, y: number): [number, number] => [wx(x, y), sy(y)];
    const seg = (x0: number, y0: number, x1: number, y1: number): void => { const a = P(x0, y0), b = P(x1, y1); g.lineBetween(a[0], a[1], b[0], b[1]); };
    const arc = (cx: number, cy: number, r: number, a0: number, a1: number, n = 40): void => {
      let prev: [number, number] | null = null;
      for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n, q = P(cx + Math.cos(a) * r, cy + Math.sin(a) * r); if (prev) g.lineBetween(prev[0], prev[1], q[0], q[1]); prev = q; }
    };
    seg(0, 0, PITCH.w, 0); seg(0, PITCH.d, PITCH.w, PITCH.d); seg(0, 0, 0, PITCH.d); seg(PITCH.w, 0, PITCH.w, PITCH.d); seg(PITCH.w / 2, 0, PITCH.w / 2, PITCH.d);
    arc(CENTER.x, CENTER.y, CENTER.r, 0, Math.PI * 2, 56);
    const c0 = P(CENTER.x, CENTER.y); g.fillStyle(col, 1).fillRect(c0[0] - 2, c0[1] - 2, 4, 4);
    for (const [gx, d] of [[0, 1], [PITCH.w, -1]] as const) {
      const bx = gx + d * AREA_BIG.len, sxx = gx + d * AREA_SMALL.len;
      seg(bx, AREA_BIG.y0, bx, AREA_BIG.y1); seg(gx, AREA_BIG.y0, bx, AREA_BIG.y0); seg(gx, AREA_BIG.y1, bx, AREA_BIG.y1);
      seg(sxx, AREA_SMALL.y0, sxx, AREA_SMALL.y1); seg(gx, AREA_SMALL.y0, sxx, AREA_SMALL.y0); seg(gx, AREA_SMALL.y1, sxx, AREA_SMALL.y1);
      const spot = gx + d * PENALTY_X, sp = P(spot, MIDY); g.fillRect(sp[0] - 2, sp[1] - 1, 4, 3);
      const a = Math.acos(Math.min(1, (AREA_BIG.len - PENALTY_X) / 48));
      if (d === 1) arc(spot, MIDY, 48, -a, a, 16); else arc(spot, MIDY, 48, Math.PI - a, Math.PI + a, 16);
    }
    for (const [x, y, a0] of [[0, 0, 0], [PITCH.w, 0, Math.PI / 2], [PITCH.w, PITCH.d, Math.PI], [0, PITCH.d, -Math.PI / 2]] as const) arc(x, y, 8, a0, a0 + Math.PI / 2, 6);
    // the corner flags of Nintendo World Cup: a white pole and a red and yellow flag that flutters
    const flap = Math.floor(this.clock * 4) % 2;
    for (const [x, y] of [[0, 0], [PITCH.w, 0], [PITCH.w, PITCH.d], [0, PITCH.d]] as const) {
      const [fx, fy] = P(x, y), X = Math.round(fx), Y = Math.round(fy);
      g.fillStyle(0x1a1020, 1).fillRect(X - 1, Y - 15, 3, 16);
      g.fillStyle(0xffffff, 1).fillRect(X, Y - 14, 1, 14);
      g.fillStyle(0x1a1020, 1).fillRect(X + 1, Y - 15, 7, 6 + flap);
      g.fillStyle(0xe8423a, 1).fillRect(X + 1, Y - 14, 5, 2 + flap);
      g.fillStyle(0xffd447, 1).fillRect(X + 1, Y - 12 + flap, 5, 2);
    }
    // the goals: the net box behind the line (under the players) and the white frame, both with the same lean
    const n = this.netG.clear(), f = this.frameG.clear(), H = GOAL.bar * PZ;
    for (const [gx, d] of [[0, -1], [PITCH.w, 1]] as const) {
      const bx = gx + d * GOAL.net;
      const p00 = P(gx, GOAL.y0), p01 = P(gx, GOAL.y1), p10 = P(bx, GOAL.y0), p11 = P(bx, GOAL.y1);
      // floor shade and the net: back wall, roof and the far side, as a grid
      n.fillStyle(0x141428, 0.25).fillPoints(([{ x: p00[0], y: p00[1] }, { x: p01[0], y: p01[1] }, { x: p11[0], y: p11[1] }, { x: p10[0], y: p10[1] }] as unknown as Phaser.Math.Vector2[]), true);
      n.lineStyle(1, 0xffffff, 0.7);
      for (let k = 0; k <= 8; k++) { const y = GOAL.y0 + ((GOAL.y1 - GOAL.y0) * k) / 8, a = P(bx, y); n.lineBetween(a[0], a[1], a[0], a[1] - H); const b = P(gx, y); n.lineBetween(b[0], b[1] - H, a[0], a[1] - H); }
      for (let k = 0; k <= 4; k++) { const hh = (H * k) / 4; n.lineBetween(p10[0], p10[1] - hh, p11[0], p11[1] - hh); n.lineBetween(p00[0], p00[1] - hh, p10[0], p10[1] - hh); }
      // the frame: two posts and the crossbar, ink under white
      for (const [w, c] of [[4, 0x2a1b3d], [2, 0xffffff]] as const) {
        f.lineStyle(w, c, 1);
        f.lineBetween(p00[0], p00[1], p00[0], p00[1] - H); f.lineBetween(p01[0], p01[1], p01[0], p01[1] - H); f.lineBetween(p00[0], p00[1] - H, p01[0], p01[1] - H);
      }
    }
  }

  /** The foot of the stands above the far touchline: a wall with the boards of the kingdom. The fans are their own picture (it moves). */
  private stands(c: Ctx): void {
    const w = this.world, y0 = Y(BOARD_Y0), y1 = Y(BOARD_Y1);
    px(c, w.wall, 0, 0, W, y0);
    // seat steps
    for (let i = 0; i < ROWS + 2; i++) { const y = y0 - (i + 1) * ROW_H; if (y + ROW_H < 0) break; px(c, w.seats[i % 2], 0, Math.max(0, y), W, ROW_H - 2); px(c, 'rgba(0,0,0,0.25)', 0, Math.max(0, y + ROW_H - 2), W, 2); }
    // the boards: blocks of colour with the words of the kingdom
    let x = 0, i = 0;
    while (x < W) {
      const txt = w.boardText[i % w.boardText.length], bg = w.boards[i % w.boards.length], fg = bg === '#2a1b3d' ? '#ffd447' : '#2a1b3d';
      const bw = textWidth(txt, 1) + 20;
      px(c, '#2a1b3d', x, y0, bw, y1 - y0); px(c, bg, x + 1, y0 + 1, bw - 2, y1 - y0 - 2);
      drawText(c, txt, x + 10, y0 + Math.round((y1 - y0 - 7) / 2), 1, () => fg);
      x += bw; i++;
    }
    px(c, 'rgba(0,0,0,0.3)', 0, y1, W, 2);
  }

  private bakeCrowd(state: 'idle' | 'cheer', k: number): void {
    const key = `crowd_${this.id}_${state}_${k}`;
    if (this.scene.textures.exists(key)) return;
    const t = this.scene.textures.createCanvas(key, W, ROWS * ROW_H + 4)!, c = t.getContext(); c.imageSmoothingEnabled = false;
    for (const f of this.fans) drawFan(c, f, poseOf(f, state, k), f.col * SEAT, 4 + (ROWS - 1 - f.row) * ROW_H, 1 - f.row * 0.08);
    t.refresh();
  }

  /** Night: four pools of light from the towers on the pitch. */
  private drawLights(): void {
    const g = this.lights;
    for (const [x, y] of [[PITCH.w * 0.18, PITCH.d * 0.3], [PITCH.w * 0.82, PITCH.d * 0.3], [PITCH.w * 0.18, PITCH.d * 0.75], [PITCH.w * 0.82, PITCH.d * 0.75]]) {
      for (let i = 6; i >= 1; i--) g.fillStyle(0xfff3b0, 0.022).fillEllipse(sx(x), sy(y), 70 * i * PX, 40 * i * PY);
    }
  }
}
