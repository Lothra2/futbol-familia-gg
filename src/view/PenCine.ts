import Phaser from 'phaser';
import type { Match, Player } from '../core/state';
import { GOAL } from '../core/field';
import { PEN } from '../core/penalties';
import type { PlayerView } from './PlayerView';
import { cropFrame, faceKey } from './Cinematic';
import { services } from '../app/services';

const INK = 0x2a1b3d;
const font = (px: number, color = '#ffffff'): Phaser.Types.GameObjects.Text.TextStyle => ({ fontFamily: 'Pixelify, sans-serif', fontSize: `${px}px`, fontStyle: 'bold', color, stroke: '#2A1B3D', strokeThickness: Math.max(3, Math.round(px / 6)) });
/** The look of each stadium at night: sky top and bottom, the two greens of the grass, the colour of the lights and the colours of the fans. */
const PAL: Record<string, { sky: [number, number]; grass: [number, number]; glow: number; fans: number[] }> = {
  volcan: { sky: [0x120a2e, 0x4a2a86], grass: [0x2f7d48, 0x3a9154], glow: 0xffd9a0, fans: [0xff8a2a, 0xe8423a, 0xffd447, 0x9b5de5, 0xffffff] },
  bosque: { sky: [0x07161a, 0x1f5a52], grass: [0x2c7a4a, 0x379256], glow: 0xfff3b0, fans: [0x5ddb43, 0xffd447, 0xc8d0d8, 0xff8a2a, 0xffffff] },
  arrecife: { sky: [0x06122e, 0x1b4f9a], grass: [0x2a8450, 0x35a05f], glow: 0xbff3ff, fans: [0x7be3ff, 0xff6fb5, 0xffffff, 0x2f5fa8, 0xffd447] },
  nubes: { sky: [0x3a2a62, 0xe58a8a], grass: [0x3b8a58, 0x48a468], glow: 0xfff3d0, fans: [0xffffff, 0xffd447, 0xe8b83a, 0xb98cff, 0xff9e7a] },
};
const hash = (i: number, k = 1): number => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };

/**
 * The shootout seen from behind the shooter, like a broadcast: the goal head on, the keeper between the posts, the crowd in the stands, the ball that
 * shrinks as it flies. Everything is a picture of `m.pen` (the core decides, this only draws), and the two figures copy the frame of the sprites that PlayerView
 * already animates from the same state (kick, dive, celebrate, sad), so no pose logic is repeated here. The side-on pixel art of the pitch is hidden under it.
 */
export class PenCine {
  private bg: Phaser.GameObjects.Graphics;
  private glow: Phaser.GameObjects.Graphics;
  private fg: Phaser.GameObjects.Graphics;
  private net: Phaser.GameObjects.Graphics;
  private shooterImg: Phaser.GameObjects.Image;
  private keeperImg: Phaser.GameObjects.Image;
  private ball: Phaser.GameObjects.Image;
  private pShoot: Phaser.GameObjects.Image;
  private pKeep: Phaser.GameObjects.Image;
  private banner: Phaser.GameObjects.Text;
  private hint: Phaser.GameObjects.Text;
  private nameS: Phaser.GameObjects.Text;
  private nameK: Phaser.GameObjects.Text;
  private excite = 0.3;
  private lastKey = '';
  private beat = 0;
  private all: Phaser.GameObjects.GameObject[];

  constructor(private scene: Phaser.Scene, private stadium: string) {
    this.bg = scene.add.graphics().setDepth(4800).setScrollFactor(0);
    this.glow = scene.add.graphics().setDepth(4801).setScrollFactor(0).setBlendMode(Phaser.BlendModes.ADD);
    this.shooterImg = scene.add.image(0, 0, 'ball').setDepth(4803).setScrollFactor(0);
    this.net = scene.add.graphics().setDepth(4801.5).setScrollFactor(0);   // the net is behind the keeper, so he is not washed out by it
    this.keeperImg = scene.add.image(0, 0, 'ball').setDepth(4802).setScrollFactor(0);
    this.fg = scene.add.graphics().setDepth(4804).setScrollFactor(0);
    this.ball = scene.add.image(0, 0, 'ball', 0).setDepth(4805).setScrollFactor(0);
    this.pShoot = scene.add.image(0, 0, 'ball').setDepth(4806).setScrollFactor(0).setOrigin(0, 1);
    this.pKeep = scene.add.image(0, 0, 'ball').setDepth(4806).setScrollFactor(0).setOrigin(1, 1);
    this.banner = scene.add.text(0, 0, '', font(24, '#ffe45c')).setOrigin(0.5).setDepth(4807).setScrollFactor(0).setResolution(1);
    this.hint = scene.add.text(0, 0, '', font(11, '#ffffff')).setOrigin(0.5, 1).setDepth(4807).setScrollFactor(0).setResolution(1);
    this.nameS = scene.add.text(0, 0, '', font(11)).setOrigin(0, 0).setDepth(4807).setScrollFactor(0).setResolution(1);
    this.nameK = scene.add.text(0, 0, '', font(11)).setOrigin(1, 0).setDepth(4807).setScrollFactor(0).setResolution(1);
    this.all = [this.bg, this.glow, this.net, this.shooterImg, this.keeperImg, this.fg, this.ball, this.pShoot, this.pKeep, this.banner, this.hint, this.nameS, this.nameK];
    this.show(false);
  }

  destroy(): void { for (const o of this.all) o.destroy(); }
  private show(on: boolean): void { for (const o of this.all) (o as unknown as { setVisible(v: boolean): void }).setVisible(on); }

  /** A portrait of a player: the face of the family (frame of caras) or the head cut out of the illustration of a rival. */
  private portrait(img: Phaser.GameObjects.Image, p: Player | undefined, keeper: boolean, frame: number): number {
    if (!p) { img.setVisible(false); return 0; }
    const sc = this.scene;
    if (p.charId && sc.textures.exists(`caras_${p.charId}`)) { img.setTexture(`caras_${p.charId}`, frame).setScale(1).setVisible(true); return 80; }
    const art = `riv_${p.species ?? 'dragon'}_${keeper ? 'b' : 'a'}`, key = `cine_${art}`, meta = (sc.cache.json.get('cine_meta') as Record<string, { w: number; h: number; headX: number; headY: number }>)?.[art];
    if (!sc.textures.exists(key) || !meta) { img.setVisible(false); return 0; }
    const w = Math.min(meta.w, 72), h = Math.min(meta.h, 72), x = Math.max(0, Math.min(meta.w - w, meta.headX - w / 2)), y = Math.max(0, Math.min(meta.h - h, meta.headY - h * 0.45));
    img.setTexture(key, cropFrame(sc, key, Math.round(x), Math.round(y), w, h)).setScale(1).setVisible(true);
    return Math.max(w, h);
  }

  update(m: Match, W: number, H: number, time: number, dt: number, views: PlayerView[]): void {
    const pen = m.pen, on = m.phase === 'penalties' && !!pen;
    this.show(on);
    if (!on || !pen) { this.lastKey = ''; return; }
    const shooter = m.players.find((p) => p.id === pen.shooter), keeper = m.players.find((p) => p.id === pen.keeper);
    const sv = views.find((v) => v.p.id === pen.shooter)?.sprite, kv = views.find((v) => v.p.id === pen.keeper)?.sprite;
    const pal = PAL[this.stadium] ?? PAL.volcan, s = pen.turn === 0 ? 1 : -1, human = shooter?.control === 'human';
    const bg = this.bg, gl = this.glow, fg = this.fg, net = this.net; bg.clear(); gl.clear(); fg.clear(); net.clear();

    // ---- geometry: the goal head on, the line of the goal at gy, the spot in front of the camera
    const gy = Math.round(H * 0.5), gh = Math.round(H * 0.26), gw = Math.round(Math.min(gh * 3, W * 0.72)), cx = Math.round(W / 2), x0 = cx - Math.round(gw / 2), x1 = x0 + gw, top = gy - gh;
    const spotY = Math.round(H * 0.84), mx = (y: number): number => cx + Math.round((s * (y - 80)) / 24 * (gw / 2)), mz = (z: number): number => gy - Math.round(gh * (z / GOAL.bar));
    const t = pen.t, step = pen.step;
    const goal = step === 'result' && pen.outcome === 'goal', saved = step === 'result' && pen.outcome === 'saved', wasted = step === 'result' && (pen.outcome === 'miss' || pen.outcome === 'post');

    // ---- excitement of the crowd
    const target = goal ? 1 : saved ? 0.65 : wasted ? 0.08 : step === 'fly' ? 0.75 : step === 'aim' ? (pen.decisive ? 0.7 : 0.45) : 0.3;
    this.excite += (target - this.excite) * Math.min(1, 4 * dt);
    const e = this.excite;

    // ---- sky and the stands
    const rows = 14;
    for (let i = 0; i < rows; i++) { const k = i / (rows - 1), c = Phaser.Display.Color.Interpolate.ColorWithColor(Phaser.Display.Color.IntegerToColor(pal.sky[0]), Phaser.Display.Color.IntegerToColor(pal.sky[1]), 100, Math.round(k * 100)); bg.fillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b), 1).fillRect(0, Math.round((gy / rows) * i), W, Math.ceil(gy / rows) + 1); }
    const fanTop = Math.round(H * 0.07), fanBot = gy - 4, pitch = 6, cols = Math.ceil(W / pitch) + 1, fanRows = Math.max(3, Math.floor((fanBot - fanTop) / 7));
    bg.fillStyle(0x1b1230, 1).fillRect(0, fanTop - 6, W, fanBot - fanTop + 8);
    for (let r = 0; r < fanRows; r++) for (let c = 0; c < cols; c++) {
      const i = r * 97 + c, col = pal.fans[Math.floor(hash(i, 2) * pal.fans.length)], ph = hash(i, 3) * 6.28, sp = 3 + hash(i, 4) * 5;
      const jump = e * (goal ? 5 : 2.4) * Math.max(0, Math.sin(time * sp + ph)), sway = (1 - e) * Math.sin(time * 1.4 + ph) * 0.8;
      const x = c * pitch + Math.round(sway) + (r % 2) * 3, y = fanTop + r * 7 - Math.round(jump);
      bg.fillStyle(0x3b2a5c, 1).fillRect(x, y + 3, 4, 4);                       // the body
      bg.fillStyle(col, 1).fillRect(x, y + 3, 4, 2);                            // the shirt
      bg.fillStyle(0xf0c9a0, 1).fillRect(x + 1, y, 2, 3);                       // the head
      if (goal && jump > 2) bg.fillStyle(0xf0c9a0, 1).fillRect(x - 1, y - 2, 1, 3).fillRect(x + 4, y - 2, 1, 3);   // the arms up
    }
    // the cameras of the press: a flash now and then once somebody takes the kick
    if (step !== 'ready') for (let i = 0; i < 18; i++) if (Math.sin(time * (6 + (i % 5)) + i * 7.3) > 0.97) fg.fillStyle(0xffffff, 0.95).fillRect(Math.round(hash(i, 5) * W), fanTop + Math.round(hash(i, 6) * (fanBot - fanTop)), 3, 3);
    // the lights of the towers
    for (const lx of [W * 0.1, W * 0.9]) { for (let k = 3; k >= 1; k--) gl.fillStyle(pal.glow, 0.09 * (4 - k)).fillCircle(Math.round(lx), Math.round(H * 0.06), Math.round(H * 0.07 * k)); }
    // ad boards along the line of the goal
    const ad = Math.round(H * 0.045); bg.fillStyle(0x15102a, 1).fillRect(0, gy - ad, W, ad);
    const ledCols = [0xffd447, 0xff6fb5, 0x7be3ff, 0x5ddb43];
    for (let i = 0; i < Math.ceil(W / 22); i++) { if ((i + Math.floor(time * 2)) % 4) bg.fillStyle(ledCols[i % 4], 1).fillRect(i * 22 + 3, gy - ad + 3, 14, ad - 6); }

    // ---- the grass in perspective
    const bands = 9;
    for (let i = 0; i < bands; i++) { const a = gy + Math.round((H - gy) * Math.pow(i / bands, 1.7)), b = gy + Math.round((H - gy) * Math.pow((i + 1) / bands, 1.7)); bg.fillStyle(pal.grass[i % 2], 1).fillRect(0, a, W, b - a + 1); }
    // lines of the area, the spot and the goal line
    bg.fillStyle(0xffffff, 0.9).fillRect(0, gy - 1, W, 2);
    const aY = gy + Math.round((H - gy) * 0.46);
    bg.lineStyle(2, 0xffffff, 0.75).lineBetween(cx - Math.round(gw * 1.45), gy, cx - Math.round(gw * 2.2), H).lineBetween(cx + Math.round(gw * 1.45), gy, cx + Math.round(gw * 2.2), H);
    bg.lineStyle(2, 0xffffff, 0.75).lineBetween(cx - Math.round(gw * 1.78), aY, cx + Math.round(gw * 1.78), aY);
    bg.fillStyle(0xffffff, 0.95).fillEllipse(cx, spotY + 2, 9, 4);

    // ---- the goal: the back net with the bulge of a goal, the frame in front
    const bx0 = x0 + Math.round(gw * 0.07), bx1 = x1 - Math.round(gw * 0.07), btop = top + Math.round(gh * 0.13), bbot = gy - Math.round(gh * 0.1);
    const impX = mx(pen.shotY), impY = mz(Math.min(pen.shotZ, GOAL.bar - 2)), bulge = goal ? Math.sin(Math.min(1, t / 0.55) * Math.PI * 0.9) * gh * 0.16 : 0;
    const bump = (x: number, y: number): number => bulge * Math.exp(-(((x - impX) / (gw * 0.28)) ** 2 + ((y - impY) / (gh * 0.5)) ** 2));
    bg.fillStyle(0x0d0a1c, 0.55).fillRect(bx0, btop, bx1 - bx0, bbot - btop);
    net.lineStyle(1, 0xffffff, 0.42);
    const gv = 14, gh2 = 7;
    for (let i = 0; i <= gv; i++) { const x = bx0 + ((bx1 - bx0) * i) / gv; let px = x, py = btop; for (let j = 1; j <= 8; j++) { const y = btop + ((bbot - btop) * j) / 8, yy = y + bump(x, y); net.lineBetween(px, py, x, yy); px = x; py = yy; } }
    for (let j = 0; j <= gh2; j++) { const y = btop + ((bbot - btop) * j) / gh2; let px = bx0, py = y + bump(bx0, y); for (let i = 1; i <= 14; i++) { const x = bx0 + ((bx1 - bx0) * i) / 14, yy = y + bump(x, y); net.lineBetween(px, py, x, yy); px = x; py = yy; } }
    net.lineStyle(1, 0xffffff, 0.3).lineBetween(x0, top, bx0, btop).lineBetween(x1, top, bx1, btop).lineBetween(x0, gy, bx0, bbot).lineBetween(x1, gy, bx1, bbot);
    // the keeper stands inside, before the front frame
    const kfeet = gy + 3;
    const kx = keeper ? mx(keeper.y) : cx;
    if (kv && keeper) {
      const sc = Math.max(2, Math.round(gh / 34)), diving = keeper.state === 'dive' || (keeper.act?.kind === 'dive');
      const flip = diving ? kx < cx : true;
      this.keeperImg.setVisible(true).setTexture(kv.texture.key, kv.frame.name).setOrigin(kv.originX, kv.originY).setScale(sc).setFlipX(flip).setPosition(kx, kfeet);
    } else this.keeperImg.setVisible(false);
    // the frame: white posts and bar with an outline
    const th = Math.max(3, Math.round(W / 150));
    fg.fillStyle(INK, 1).fillRect(x0 - th - 1, top - th - 1, gw + 2 * th + 2, th + 2).fillRect(x0 - th - 1, top - th - 1, th + 2, gh + th + 2).fillRect(x1 - 1, top - th - 1, th + 2, gh + th + 2);
    fg.fillStyle(0xffffff, 1).fillRect(x0 - th, top - th, gw + 2 * th, th).fillRect(x0 - th, top - th, th, gh + th).fillRect(x1, top - th, th, gh + th);
    fg.fillStyle(0xd9d2ec, 1).fillRect(x0 - th, top - 1, gw + 2 * th, 1);
    // the shadow of the goal on the grass
    bg.fillStyle(0x000000, 0.18).fillRect(x0, gy, gw, Math.max(2, Math.round(gh * 0.06)));

    // ---- the shooter beside the ball, a step bigger than the keeper because he is closer
    const ssc = Math.max(2, Math.round((gh / 34) * 1.1));
    if (sv && shooter) {
      const walk = step === 'ready' ? Math.min(1, t / (PEN.ready * 0.8)) : 1, ease = 1 - Math.pow(1 - walk, 2), px = cx - Math.round(gw * 0.27) - Math.round((1 - ease) * gw * 0.5);
      const bob = step === 'ready' && walk < 1 ? Math.round(Math.abs(Math.sin(time * 10)) * 2) : 0;
      this.shooterImg.setVisible(true).setTexture(sv.texture.key, sv.frame.name).setOrigin(sv.originX, sv.originY).setScale(ssc).setFlipX(false).setPosition(px, spotY + 10 - bob);
      fg.fillStyle(0x000000, 0.25).fillEllipse(px, spotY + 10, 12 * ssc / 2, 4);
    } else this.shooterImg.setVisible(false);

    // ---- the ball: from the spot to the goal (or where the result puts it), smaller as it goes
    const sc0 = H >= 300 ? 4 : 3, sc1 = 2;
    let bxp = cx, byp = spotY - 4, bsc = sc0, bAlpha = 1;
    const endX = mx(pen.shotY), endY = mz(pen.shotZ);
    if (step === 'ready' || step === 'aim') { bxp = cx; byp = spotY - 4; }
    else if (step === 'fly') {
      const u = Math.min(1, t / PEN.fly), uu = 1 - Math.pow(1 - u, 1.6);
      const tx = pen.outcome === 'saved' ? mx(pen.diveY + (pen.shotY - pen.diveY) * 0.3) : endX;
      bxp = Math.round(cx + (tx - cx) * uu); byp = Math.round(spotY - 4 + (endY - (spotY - 4)) * uu - Math.sin(u * Math.PI) * H * 0.05 * (pen.shotZ / GOAL.bar + 0.4));
      bsc = Math.max(sc1, Math.round(sc0 - (sc0 - sc1) * u));
    } else {
      const tx = pen.outcome === 'saved' ? mx(pen.diveY + (pen.shotY - pen.diveY) * 0.3) : endX, k = Math.min(1, t / 0.5);
      bxp = tx; byp = endY; bsc = sc1;
      if (pen.outcome === 'goal') { byp = endY + Math.round(k * (gy - endY - 6) * 0.9); bAlpha = 1; }           // the ball falls inside the net
      else if (pen.outcome === 'saved') { byp = Math.round(endY + k * (gy + 8 - endY)); bxp = Math.round(tx + (cx > tx ? 1 : -1) * k * 10); bsc = sc1 + (k > 0.9 ? 0 : 0); }   // it drops at the feet of the keeper
      else if (pen.outcome === 'post') { bxp = Math.round(tx + (tx < cx ? -1 : 1) * k * gw * 0.12); byp = Math.round(endY + k * H * 0.12); bsc = Math.round(sc1 + k * 2); }   // it comes back off the post
      else { byp = endY - Math.round(k * H * 0.12); bxp = Math.round(endX + (endX < cx ? -1 : 1) * k * W * 0.08); bAlpha = 1 - k; }   // wide or over: it keeps going
    }
    if (step === 'fly') fg.fillStyle(0x000000, 0.22).fillEllipse(Math.round(bxp), Math.round(spotY - 2 + (gy - spotY) * Math.min(1, t / PEN.fly)), 5 * bsc, 2 * bsc);
    this.ball.setVisible(true).setFrame(Math.floor(time * 14) % 4).setScale(bsc).setAlpha(bAlpha).setPosition(bxp, byp);

    // ---- the reticle on the goal while a person aims (the AI only shows a faint mark)
    if (step === 'aim') {
      const rx = mx(pen.aimY), ry = mz(pen.aimZ * GOAL.bar), a = human ? 1 : 0.18, k = 0.5 + 0.5 * Math.sin(time * 9), r = 9 + k * 2;
      fg.lineStyle(3, INK, a).strokeCircle(rx, ry, r + 1);
      fg.lineStyle(2, 0xffffff, a).strokeCircle(rx, ry, r);
      fg.lineStyle(2, 0xffe45c, a).lineBetween(rx - r - 7, ry, rx - r + 1, ry).lineBetween(rx + r - 1, ry, rx + r + 7, ry).lineBetween(rx, ry - r - 7, rx, ry - r + 1).lineBetween(rx, ry + r - 1, rx, ry + r + 7);
    }

    // ---- bars like a film, a white flash coming in, the red or gold edge of a kick that decides it
    const bar = Math.round(H * 0.075);
    fg.fillStyle(0x080410, 1).fillRect(0, 0, W, bar).fillRect(0, H - bar, W, bar);
    fg.fillStyle(0xffd447, 1).fillRect(0, bar, W, 2).fillRect(0, H - bar - 2, W, 2);
    if (m.phaseT < 0.5) fg.fillStyle(0xffffff, 1 - m.phaseT / 0.5).fillRect(0, 0, W, H);
    for (let i = 0; i < 4; i++) { fg.fillStyle(0x000000, 0.2 - i * 0.045); const ed = 6 + i * 9; fg.fillRect(0, 0, W, ed).fillRect(0, H - ed, W, ed).fillRect(0, 0, ed, H).fillRect(W - ed, 0, ed, H); }
    const hot = pen.decisive && (step === 'ready' || step === 'aim');
    if (hot) { const pulse = 0.35 + 0.25 * Math.sin(time * 7); fg.lineStyle(8, pen.decisive === 'win' ? 0xffd447 : 0xff3d5a, pulse).strokeRect(4, 4, W - 8, H - 8); }
    if (goal && t < 1.6) for (let i = 0; i < 46; i++) { const cxp = hash(i, 8) * W, cyp = ((t * (70 + hash(i, 9) * 90) + hash(i, 10) * H) % H), col = [0xff5e7e, 0xffb23f, 0xffe45c, 0x5ddb43, 0x4cc9e8, 0xb98cff][i % 6]; fg.fillStyle(col, 1).fillRect(Math.round(cxp), Math.round(cyp), 3, 3); }
    if (goal && t < 0.5) fg.fillStyle(0xffffff, 0.5 - t).fillRect(0, 0, W, H);

    // ---- the heartbeat of a kick that decides it, and the words
    const key = `${pen.round}:${pen.turn}:${pen.kicks[0].length}${pen.kicks[1].length}:${step}`;
    if (key !== this.lastKey) { this.lastKey = key; this.beat = 0; if (step === 'ready' && pen.decisive) services.audio?.play('slam'); if (step === 'fly') services.audio?.play('whoosh'); }
    if (hot && step === 'aim') { this.beat += dt; if (this.beat > 0.75) { this.beat = 0; services.audio?.play('heart'); } }
    const txt = pen.decisive === 'win' ? '¡PARA GANAR!' : pen.decisive === 'last' ? '¡SI FALLA SE ACABA!' : '';
    this.banner.setVisible(!!hot && txt !== '').setText(txt).setColor(pen.decisive === 'win' ? '#ffe45c' : '#ff8aa0').setPosition(cx, bar + Math.round(H * 0.07)).setScale(1 + 0.06 * Math.sin(time * 7));
    this.hint.setVisible(step === 'aim' && human).setText(this.hintText()).setPosition(cx, H - bar - 6);

    // ---- the faces: the one who kicks on the left, the keeper on the right
    const fs = step === 'result' ? (goal ? 3 : 2) : step === 'aim' || step === 'fly' ? 1 : 0, fk = step === 'result' ? (saved ? 3 : wasted ? 0 : 2) : step === 'fly' ? 2 : 0;
    const sw = this.portrait(this.pShoot, shooter, false, fs), kw = this.portrait(this.pKeep, keeper, true, fk);
    const py = H - bar - 14;
    this.pShoot.setPosition(10, py); this.pKeep.setPosition(W - 10, py);
    if (sw) fg.lineStyle(2, INK, 1).strokeRect(10, py - (this.pShoot.height || sw), sw, this.pShoot.height || sw);
    if (kw) fg.lineStyle(2, INK, 1).strokeRect(W - 10 - kw, py - (this.pKeep.height || kw), kw, this.pKeep.height || kw);
    this.nameS.setVisible(!!shooter).setText(shooter?.name ?? '').setPosition(12, py + 2);
    this.nameK.setVisible(!!keeper).setText(keeper?.name ?? '').setPosition(W - 12, py + 2);
  }

  private hintText(): string { return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches ? 'Mueve el dedo para apuntar y toca Tiro' : '← → apuntas · ↑ ↓ la altura · Tiro patea'; }
}
