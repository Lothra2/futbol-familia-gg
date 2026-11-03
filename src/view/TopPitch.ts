import Phaser from 'phaser';
import { AREA_BIG, AREA_SMALL, CENTER, GOAL, PENALTY_X, PITCH } from '../core/field';
import { BOUNDS, MARGIN, PX, PY, PZ, sx, sy } from '../core/proj';
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
/** Where the stands sit (world y): the boards at the foot, then the rows of fans going up. */
const BOARD_Y0 = -22, BOARD_Y1 = -8, STAND_Y1 = BOARD_Y0 - 2;
const GRADE: Record<TimeOfDay, number> = { day: 0xffffff, sunset: 0xffdcc0, night: 0xa0a8e0 };
const MIX: Record<WorldId, Partial<Record<FanKind, number>>> = { volcan: { dragon: 0.7, human: 0.3 }, bosque: { mapache: 0.7, human: 0.3 }, arrecife: { tiburon: 0.7, human: 0.3 }, nubes: { buho: 0.7, human: 0.3 } };

const px = (c: Ctx, col: string, x: number, y: number, w = 1, h = 1): void => { c.fillStyle = col; c.fillRect(x, y, w, h); };

/** The pitch seen from above like Nintendo World Cup, one per kingdom: striped ground with patches and little things on it, the lines from the
 *  same constants the rules use, the goals with their nets, the boards and a live crowd above the far touchline, and the light of the hour. */
export class TopPitch {
  readonly world: World;
  readonly time: TimeOfDay;
  private img: Phaser.GameObjects.Image;
  private goals: Phaser.GameObjects.Image[] = [];
  private frames: Phaser.GameObjects.Image[] = [];
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
    if (!scene.textures.exists('goal_net')) this.bakeGoal();
    for (const side of [0, 1]) {
      const gx = side === 0 ? 0 : PITCH.w;
      // the net and the back of the goal behind everything that stands on the pitch, the frame (posts and bar) in front of what is behind the near post
      this.goals.push(scene.add.image(sx(gx), sy(GOAL.y1), 'goal_net').setOrigin(side === 0 ? 1 : 0, 1).setFlipX(side === 1).setDepth(150));
      this.frames.push(scene.add.image(sx(gx), sy(GOAL.y1), 'goal_frame').setOrigin(side === 0 ? 1 : 0, 1).setFlipX(side === 1).setDepth(200 + GOAL.y1 + 0.5));
    }
    this.lights = scene.add.graphics().setDepth(3550).setBlendMode(Phaser.BlendModes.ADD);
    this.grade = scene.add.rectangle(0, 0, 10, 10, GRADE[this.time]).setOrigin(0, 0).setDepth(3500).setScrollFactor(0).setBlendMode(Phaser.BlendModes.MULTIPLY).setVisible(this.time !== 'day');
    if (this.time === 'night') this.drawLights();
  }

  layout(w: number, h: number): void { this.grade.setSize(w, h); }

  /** The crowd cheers for a while (a goal) or gasps for a moment (a save, a post, a special). */
  goal(): void { this.cheerT = 4.5; }
  gasp(): void { this.cheerT = Math.max(this.cheerT, 1.2); }

  update(dt: number): void {
    this.clock += dt; this.cheerT = Math.max(0, this.cheerT - dt);
    this.state = this.cheerT > 0 ? 'cheer' : 'idle';
    const k = Math.floor(this.clock * (this.state === 'cheer' ? 8 : 2)) % 4;
    if (k !== this.k || this.crowd.texture.key.indexOf(this.state) < 0) { this.k = k; this.crowd.setTexture(`crowd_${this.id}_${this.state}_${k}`); }
  }

  destroy(): void { for (const o of [this.img, this.crowd, this.grade, this.lights, ...this.goals, ...this.frames]) o.destroy(); }

  // ------------------------------------------------------------------ baking
  private bake(key: string): void {
    const t = this.scene.textures.createCanvas(key, W, H)!, c = t.getContext(); c.imageSmoothingEnabled = false;
    const w = this.world, r = rng(7 + key.length * 13);
    // the ground: horizontal stripes of 12 px everywhere, a little darker outside the lines
    for (let y = 0; y < H; y += 12) px(c, w.stripe[(y / 12) % 2], 0, y, W, 12);
    // the patches: blobs of a third colour with stepped edges, the way the NES draws them (an 8 px grid), two tones that follow the stripes
    const blobs: { x: number; y: number; r: number }[] = [];
    const n = Math.round((W * H) / (w.patchSize * w.patchSize * 9) * w.patchCover * 3);
    for (let i = 0; i < n; i++) blobs.push({ x: r() * W, y: r() * H, r: w.patchSize * (0.6 + r() * 0.9) });
    const G = 6;
    for (let gy = 0; gy < H; gy += G) for (let gx = 0; gx < W; gx += G) {
      let v = 0;
      for (const b of blobs) { const d = Math.hypot((gx - b.x) / 1.6, gy - b.y); if (d < b.r) v += 1 - d / b.r; }
      if (v > 0.45) px(c, w.patch[(Math.floor(gy / 12)) % 2], gx, gy, G, G);
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
    this.lines(c);
    this.stands(c);
    t.refresh();
  }

  /** Little things on the ground in small clusters (like the flower rings of the NES pitch), never on the lines. */
  private decorate(c: Ctx, r: () => number): void {
    const d = this.world.deco, clusters = Math.round((W * H) / 10000 * d.density / 3);
    for (let i = 0; i < clusters; i++) {
      const cx = r() * W, cy = Y(-4) + r() * (Y(PITCH.d + 20) - Y(-4)), m = 2 + Math.floor(r() * 4);
      for (let j = 0; j < m; j++) {
        const x = Math.round(cx + (r() - 0.5) * 26), y = Math.round(cy + (r() - 0.5) * 14), col = d.colors[Math.floor(r() * d.colors.length)];
        if (d.kind === 'flores') { px(c, col, x, y - 1); px(c, col, x - 1, y); px(c, col, x + 1, y); px(c, col, x, y + 1); px(c, '#ffe45c', x, y); }
        else if (d.kind === 'piedras') { px(c, '#2e2230', x, y, 3, 2); px(c, col, x, y, 2, 1); }
        else if (d.kind === 'conchas') { px(c, col, x, y, 3, 1); px(c, col, x + 1, y - 1); px(c, 'rgba(0,0,0,0.25)', x, y + 1, 3, 1); }
        else if (d.kind === 'brillos') { px(c, col, x, y - 1, 1, 3); px(c, col, x - 1, y, 3, 1); }
        else { px(c, col, x, y, 2, 1); px(c, col, x + 1, y + 1, 2, 1); }
      }
    }
  }

  /** The white lines, from the constants of field.ts, 2 px thick. */
  private lines(c: Ctx): void {
    const col = this.world.line, L = 2;
    const hline = (x0: number, x1: number, y: number): void => px(c, col, X(x0), Y(y) - 1, X(x1) - X(x0), L);
    const vline = (x: number, y0: number, y1: number): void => px(c, col, X(x) - 1, Y(y0), L, Y(y1) - Y(y0));
    const arc = (cx: number, cy: number, rr: number, a0: number, a1: number): void => {
      for (let i = 0; i <= 360; i++) { const a = a0 + ((a1 - a0) * i) / 360; px(c, col, Math.round(X(cx) + Math.cos(a) * rr * PX) - 1, Math.round(Y(cy) + Math.sin(a) * rr * PY) - 1, L, L); }
    };
    hline(0, PITCH.w, 0); hline(0, PITCH.w, PITCH.d); vline(0, 0, PITCH.d); vline(PITCH.w, 0, PITCH.d); vline(PITCH.w / 2, 0, PITCH.d);
    arc(CENTER.x, CENTER.y, CENTER.r, 0, Math.PI * 2); px(c, col, X(CENTER.x) - 2, Y(CENTER.y) - 2, 4, 4);
    for (const [gx, d] of [[0, 1], [PITCH.w, -1]] as const) {
      const bx = gx + d * AREA_BIG.len, sxx = gx + d * AREA_SMALL.len;
      vline(bx, AREA_BIG.y0, AREA_BIG.y1); hline(Math.min(gx, bx), Math.max(gx, bx), AREA_BIG.y0); hline(Math.min(gx, bx), Math.max(gx, bx), AREA_BIG.y1);
      vline(sxx, AREA_SMALL.y0, AREA_SMALL.y1); hline(Math.min(gx, sxx), Math.max(gx, sxx), AREA_SMALL.y0); hline(Math.min(gx, sxx), Math.max(gx, sxx), AREA_SMALL.y1);
      const spot = gx + d * PENALTY_X; px(c, col, X(spot) - 2, Y(GOAL.y0 + 36) - 1, 4, 3);
      // the arc of the area: the part of the circle round the spot that is outside the big area
      const cosA = (AREA_BIG.len - PENALTY_X) / 48, a = Math.acos(Math.min(1, cosA));
      if (d === 1) arc(spot, (GOAL.y0 + GOAL.y1) / 2, 48, -a, a); else arc(spot, (GOAL.y0 + GOAL.y1) / 2, 48, Math.PI - a, Math.PI + a);
    }
    for (const [x, y, a0] of [[0, 0, 0], [PITCH.w, 0, Math.PI / 2], [PITCH.w, PITCH.d, Math.PI], [0, PITCH.d, -Math.PI / 2]] as const) arc(x, y, 8, a0, a0 + Math.PI / 2);
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

  /** The goal seen from above and the south: the net box behind the line and, apart, the white frame (posts and crossbar), for the left goal. */
  private bakeGoal(): void {
    const dep = Math.round(GOAL.net * PX), hgt = Math.round(GOAL.bar * PZ), span = Math.round((GOAL.y1 - GOAL.y0) * PY);
    const w = dep + 3, h = span + hgt + 2;
    const net = this.scene.textures.createCanvas('goal_net', w, h)!, c = net.getContext(); c.imageSmoothingEnabled = false;
    // the floor of the goal (shade), the back of the net and the roof, as a grid
    px(c, 'rgba(20,20,40,0.28)', 0, hgt, dep, span);
    c.fillStyle = 'rgba(255,255,255,0.75)';
    for (let y = 0; y <= span + hgt; y += 3) c.fillRect(0, y, 1, 1);
    for (let x = 0; x < dep; x += 3) for (let y = 0; y <= span + hgt; y += 3) c.fillRect(x, y, 1, 1);
    for (let y = 0; y <= span + hgt; y += 6) c.fillRect(0, y, dep, 1);
    for (let x = 0; x <= dep; x += 6) c.fillRect(x, 0, 1, h - 1);
    px(c, '#ffffff', 0, 0, 1, h - 1);
    net.refresh();
    const fr = this.scene.textures.createCanvas('goal_frame', w, h)!, f = fr.getContext(); f.imageSmoothingEnabled = false;
    // the crossbar seen from above is the top edge, the posts drop to the ground at the two ends; ink first, white on top
    px(f, '#2a1b3d', w - 4, 0, 4, h);
    px(f, '#ffffff', w - 3, 0, 2, h - 1);
    px(f, '#2a1b3d', dep - 1, 0, w - dep + 1, 3); px(f, '#ffffff', dep, 1, w - dep - 1, 1);
    px(f, '#d9d2ec', w - 3, hgt, 2, 1); px(f, '#d9d2ec', w - 3, h - 2, 2, 1);
    fr.refresh();
  }

  /** Night: four pools of light from the towers on the pitch. */
  private drawLights(): void {
    const g = this.lights;
    for (const [x, y] of [[PITCH.w * 0.18, PITCH.d * 0.3], [PITCH.w * 0.82, PITCH.d * 0.3], [PITCH.w * 0.18, PITCH.d * 0.75], [PITCH.w * 0.82, PITCH.d * 0.75]]) {
      for (let i = 6; i >= 1; i--) g.fillStyle(0xfff3b0, 0.022).fillEllipse(sx(x), sy(y), 70 * i * PX, 40 * i * PY);
    }
  }
}
