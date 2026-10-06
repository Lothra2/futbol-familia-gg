import Phaser from 'phaser';
import type { SpecialKind, SpecialState } from '../core/state';
import { T_ES } from '../data/text.es';
import { services } from '../app/services';

/** Everything the cinematic needs to know about who shoots and who defends. */
export interface CineInfo {
  /** Key of the illustration of the shooter (cine_<key>). */
  art: string;
  /** Key of the illustration of the keeper that stretches (cine_<key>), or null to use `keeperSprite`. */
  keeperArt: string | null;
  /** Fallback while a kingdom has no illustration: a sprite sheet frame drawn at an integer scale. */
  shooterSprite?: { key: string; frame: number };
  keeperSprite?: { key: string; frame: number };
  /** Identity colour of the shooter (the background of its panels). */
  color: number;
}

interface Part { x: number; y: number; vx: number; vy: number; life: number; max: number; col: number; s: number; shape: 'sq' | 'ring' | 'star' | 'leaf' | 'grow' }

const INK = 0x2a1b3d;
const PALETTES: Record<SpecialKind, number[]> = {
  arcoiris: [0xff5e7e, 0xffb23f, 0xffe45c, 0x5ddb43, 0x4cc9e8, 0x6d7bff, 0xb98cff],
  burbuja: [0xbff3ff, 0xffffff, 0x8fe3ff, 0xd6c8ff],
  canonazo: [0xff4d2e, 0xff9a2e, 0xffe45c, 0xffffff],
  estrellas: [0xb98cff, 0x8a5be0, 0xffe45c, 0xffffff],
  carrera: [0x7be3ff, 0xffffff, 0x3fb6f2, 0xffe45c],
  relampago: [0xffe45c, 0xffffff, 0x7be3ff, 0x2f6fe0],
  llamarada: [0xff4d2e, 0xff9a2e, 0xffe45c, 0xfff3b0],
  ola: [0x4cc9e8, 0xffffff, 0x2f8fe0, 0xbff3ff],
  picada: [0xffffff, 0xf3e3c4, 0xd9b27a, 0xbff3ff],
  hojas: [0x5ddb43, 0x2f9a3a, 0xd9a05b, 0xffe45c],
};
/** Fractions of the duration of each segment (flash, close-up of the shooter, the ball, the keeper, the result). */
/** The shape of the particles of each power. */
const SHAPE: Record<SpecialKind, Part['shape']> = { arcoiris: 'sq', burbuja: 'ring', canonazo: 'grow', estrellas: 'star', carrera: 'sq', relampago: 'sq', llamarada: 'sq', ola: 'ring', picada: 'leaf', hojas: 'leaf' };
const FULL = { flash: 0.10, face: 0.25, eyes: 0.36, boot: 0.48, ball: 0.68, keeper: 0.86 };
const SHORT = { flash: 0.06, face: 0.40, eyes: 0.40, boot: 0.40, ball: 0.75, keeper: 0.75 };

/** Texture key of the strip of faces that belongs to an illustration (`thor_a` is Thor), see FACES in Boot. */
export const faceKey = (art: string): string => `caras_${art.replace(/_[ab]$/, '')}`;

/** A crop of an illustration as a texture frame (created once, named by its rectangle). */
export function cropFrame(scene: Phaser.Scene, key: string, sx: number, sy: number, w: number, h: number): string {
  const tex = scene.textures.get(key), name = `crop_${sx}_${sy}_${w}_${h}`;
  if (!tex.has(name)) tex.add(name, 0, sx, sy, w, h);
  return name;
}
const font = (px: number): Phaser.Types.GameObjects.Text.TextStyle => ({ fontFamily: 'Pixelify, sans-serif', fontSize: `${px}px`, fontStyle: 'bold', color: '#ffffff', stroke: '#2A1B3D', strokeThickness: Math.max(3, Math.round(px / 6)) });

/** The cinematic of a special (GAME_DESIGN section 7, ART_BIBLE section 8): comic panels with the illustration of the shooter, the ball with its trail,
 *  the keeper and the result. It is a pure function of the simulation clock (`special.t`), so a pause stops it and a skip ends it. Every picture is
 *  drawn at a whole-number scale. */
export class Cinematic {
  private root: Phaser.GameObjects.Container;
  private g: Phaser.GameObjects.Graphics;
  /** Drawn over the painting of the power (trail, particles, border, speed lines); everything else is on `g`, under it. */
  private over: Phaser.GameObjects.Graphics;
  private name: Phaser.GameObjects.Text;
  private res: Phaser.GameObjects.Text;
  private img: Phaser.GameObjects.Image;
  private keep: Phaser.GameObjects.Image;
  private ball: Phaser.GameObjects.Image;
  /** The painting of the power behind the flight of the ball (cine_fx_<kind>), under the lines and the trail. */
  private fxImg: Phaser.GameObjects.Image;
  /** The face of the shooter that reacts at the end: laughing for a goal, shocked for a save. */
  private face: Phaser.GameObjects.Image;
  /** The AHORA ring (mejora 4) goes above every picture, with its label. */
  private top: Phaser.GameObjects.Graphics;
  private ahora: Phaser.GameObjects.Text;
  private ringSeen: string | null = null;
  private parts: Part[] = [];
  private info: CineInfo | null = null;
  private kind: SpecialKind = 'arcoiris';
  private last = 0;
  private lastPhase = '';
  private hit = false;
  private lastX = 0;
  private lastY = 0;
  private hist: [number, number][] = [];
  private meta: Record<string, { w: number; h: number; headX: number; headY: number }>;
  active = false;

  constructor(private scene: Phaser.Scene) {
    this.meta = (scene.cache.json.get('cine_meta') as Cinematic['meta']) ?? {};
    this.g = scene.add.graphics();
    this.fxImg = scene.add.image(0, 0, 'ball').setOrigin(0, 0).setVisible(false);
    this.over = scene.add.graphics();
    this.img = scene.add.image(0, 0, 'ball').setOrigin(0, 0).setVisible(false);
    this.keep = scene.add.image(0, 0, 'ball').setOrigin(0, 0).setVisible(false);
    this.face = scene.add.image(0, 0, 'ball').setOrigin(0.5, 1).setVisible(false);
    this.ball = scene.add.image(0, 0, 'ball', 0).setOrigin(0.5, 0.5).setScale(4).setVisible(false);
    this.top = scene.add.graphics();
    this.ahora = scene.add.text(0, 0, '', font(26)).setOrigin(0.5, 0.5).setResolution(1).setVisible(false);
    this.name = scene.add.text(0, 0, '', font(30)).setOrigin(0.5, 0.5).setResolution(1);
    this.res = scene.add.text(0, 0, '', font(34)).setOrigin(0.5, 0.5).setResolution(1).setVisible(false);
    this.root = scene.add.container(0, 0, [this.g, this.fxImg, this.over, this.img, this.keep, this.ball, this.face, this.top, this.ahora, this.name, this.res]).setDepth(5000).setScrollFactor(0).setVisible(false);
  }

  /** Display objects that show a picture, for the test of whole-number scales. */
  pictures(): Phaser.GameObjects.Image[] { return [this.fxImg, this.img, this.keep, this.ball, this.face]; }

  start(sp: SpecialState, info: CineInfo): void {
    this.active = true; this.info = info; this.kind = sp.kind; this.parts = []; this.hist = []; this.last = 0; this.lastPhase = ''; this.hit = false;
    this.root.setVisible(true).setPosition(0, 0);
    this.name.setText(T_ES.specials[sp.kind] ?? '');
    this.res.setVisible(false);
  }

  stop(): void {
    this.active = false; this.info = null; this.root.setVisible(false); this.g.clear(); this.over.clear(); this.top.clear(); this.ahora.setVisible(false); this.ringSeen = null;
    this.fxImg.setVisible(false); this.face.setVisible(false); this.img.setVisible(false); this.keep.setVisible(false); this.ball.setVisible(false); this.res.setVisible(false); this.parts = [];
  }

  private setPic(im: Phaser.GameObjects.Image, art: string | null, sprite: { key: string; frame: number } | undefined, maxH: number, maxW: number): { w: number; h: number; s: number } {
    if (art && this.scene.textures.exists(`cine_${art}`)) {
      const m = this.meta[art], s = Math.max(1, Math.min(Math.floor(maxH / m.h), Math.floor(maxW / m.w)));
      im.setTexture(`cine_${art}`).setFrame('__BASE').setScale(s).setVisible(true);
      return { w: m.w, h: m.h, s };
    }
    const k = sprite?.key ?? 'riv_dragon', f = sprite?.frame ?? 0, s = Math.max(1, Math.min(Math.floor(maxH / 48), Math.floor(maxW / 48)));
    im.setTexture(k, f).setScale(s).setVisible(true);
    return { w: 48, h: 48, s };
  }

  /** Draws the frame for the simulation time `sp.t` of `sp.dur`. `dt` is real time, only for the little particles. */
  update(sp: SpecialState, W: number, H: number, dt: number): void {
    if (!this.active || !this.info) return;
    const info = this.info, g = this.g, t = sp.t, dur = sp.dur, u = Math.min(1, t / dur);
    const off = dur < 1;
    const seg = sp.full ? FULL : SHORT;
    g.clear(); this.over.clear(); this.top.clear(); this.ahora.setVisible(false);
    const shake = u > seg.ball && u < seg.ball + 0.05 ? (Math.round(t * 60) % 2 ? 2 : -2) : 0;
    this.root.setPosition(shake, 0);
    const col = info.color;
    const shade = (c: number, k: number): number => { const r = ((c >> 16) & 255) * k, gg = ((c >> 8) & 255) * k, b = (c & 255) * k; return (Math.min(255, r) << 16) | (Math.min(255, gg) << 8) | Math.min(255, b); };
    // what to show: 'face' | 'ball' | 'keeper' | 'result' (the short one joins the ball and the keeper)
    const phase = off ? 'flash' : u < seg.flash ? 'flash' : u < seg.face ? 'face' : u < seg.eyes ? 'eyes' : u < seg.boot ? 'boot' : u < seg.ball ? 'ball' : u < seg.keeper ? 'keeper' : 'result';
    // the sound of each cut: a whoosh into every picture, a boom at the moment of contact
    if (phase !== this.lastPhase) {
      this.lastPhase = phase;
      if (phase === 'face' || phase === 'eyes' || phase === 'ball') services.audio?.play('whoosh');
      else if (phase === 'keeper') services.audio?.play('tick');
      else if (phase === 'result') services.audio?.play(sp.outcome === 'goal' ? 'goal' : 'save');
    }
    if (phase === 'boot' && !this.hit && u > seg.eyes + (seg.boot - seg.eyes) * 0.4) { this.hit = true; services.audio?.play('impact'); services.audio?.swell(0.6, 1.5); }
    const cx = W / 2, cy = H / 2;
    // background of the identity colour with speed lines (radial in the close-up, horizontal in the flight)
    g.fillStyle(shade(col, 0.55), 1).fillRect(0, 0, W, H);
    const lines = (radial: boolean): void => {
      g.lineStyle(2, shade(col, 1.25), 1);
      for (let i = 0; i < 30; i++) {
        if (radial) {
          const a = (i / 30) * Math.PI * 2 + Math.sin(i * 12.9) * 0.05, r0 = 70 + ((t * 480 + i * 53) % 150);
          g.lineBetween(Math.round(cx + Math.cos(a) * r0), Math.round(cy + Math.sin(a) * r0), Math.round(cx + Math.cos(a) * (r0 + 70 + (i % 5) * 18)), Math.round(cy + Math.sin(a) * (r0 + 70 + (i % 5) * 18)));
        } else {
          const y = Math.round(((i * 37) % 100) / 100 * H), x = Math.round(W - ((t * 900 + i * 71) % (W + 120)));
          g.lineBetween(x, y, x + 50 + (i % 4) * 24, y);
        }
      }
    };
    const frame = (x: number, y: number, w: number, h: number, bg: number): void => {
      g.fillStyle(INK, 1).fillRect(x - 2, y - 2, w + 4, h + 4); g.fillStyle(bg, 1).fillRect(x, y, w, h);
    };
    this.fxImg.setVisible(false); this.face.setVisible(false); this.img.setVisible(false); this.keep.setVisible(false); this.ball.setVisible(false); this.res.setVisible(false);
    const dtn = Math.min(0.05, dt);
    if (phase === 'flash') {
      lines(true);
      // the name of the power slams in: three jumps of size, then a shake
      const k = off ? 1 : Math.min(1, t / Math.max(0.01, seg.flash * dur));
      const sc = k < 0.25 ? 3 : k < 0.5 ? 2 : k < 0.7 ? 1.4 : 1, sh = k > 0.7 && k < 1 ? (Math.round(t * 60) % 2 ? 3 : -3) : 0;
      this.name.setVisible(true).setPosition(cx + sh, cy).setScale(sc);
    } else if (phase === 'face') {
      lines(true);
      const fw = Math.min(W - 24, 280), fh = H - 44, fx = Math.round(cx - fw / 2), fy = 38 + Math.round((H - 44 - fh) / 2);
      frame(fx, fy, fw, fh, shade(col, 0.8)); lines(true);
      // slide in from the left, then jumps of whole-number zoom on the face (x1, x2, x3)
      const k = (u - seg.flash) / (seg.face - seg.flash);
      const art = info.art, m = this.meta[art];
      if (m && this.scene.textures.exists(`cine_${art}`)) {
        const step = k < 0.4 ? 1 : k < 0.7 ? 2 : 3;
        const tex = this.scene.textures.get(`cine_${art}`);
        const cw = Math.floor(fw / step) - 6, ch = Math.floor(fh / step) - 6;
        const sx = step === 1 ? 0 : Math.max(0, Math.min(m.w - cw, m.headX - Math.floor(cw / 2))), sy = step === 1 ? 0 : Math.max(0, Math.min(m.h - ch, m.headY - Math.floor(ch * 0.4)));
        const name = `face${step}_${cw}_${ch}_${sx}_${sy}`;
        if (!tex.has(name)) tex.add(name, 0, sx, sy, Math.min(cw, m.w - sx), Math.min(ch, m.h - sy));
        const slide = Math.round(Math.max(0, 1 - k * 5) * 80);
        const dw = Math.min(cw, m.w - sx) * step, dh = Math.min(ch, m.h - sy) * step;
        this.img.setTexture(`cine_${art}`, name).setScale(step).setVisible(true).setPosition(Math.round(fx + (fw - dw) / 2) - slide, Math.round(fy + (fh - dh) / 2));
      } else {
        const p = this.setPic(this.img, null, info.shooterSprite, fh - 6, fw - 6);
        this.img.setPosition(Math.round(fx + (fw - p.w * p.s) / 2), Math.round(fy + (fh - p.h * p.s) / 2));
      }
      this.name.setVisible(true).setPosition(cx, 22).setScale(1);
    } else if (phase === 'eyes' || phase === 'boot') {
      this.closeUp(phase, g, W, H, (u - (phase === 'eyes' ? seg.face : seg.eyes)) / ((phase === 'eyes' ? seg.eyes : seg.boot) - (phase === 'eyes' ? seg.face : seg.eyes)), col, shade, dtn);
    } else if (phase === 'ball') {
      lines(false);
      const ph = Math.min(H - 70, 170), py = Math.round(cy - ph / 2) + 12;
      const fxKey = `cine_fx_${this.kind}`, hasFx = this.scene.textures.exists(fxKey), og = hasFx ? this.over : g;
      if (hasFx) {
        // the painting of the power fills the panel, cropped to it, at a whole-number scale, and slides a little so the flight feels fast
        const tex = this.scene.textures.get(fxKey).getSourceImage() as HTMLImageElement, pw = W - 24, sc = Math.max(1, Math.ceil(Math.max(pw / tex.width, ph / tex.height)));
        const ox = Math.round(((u - seg.face) / (seg.ball - seg.face)) * 24 * sc), cw = Math.min(tex.width, Math.ceil(pw / sc)), ch = Math.min(tex.height, Math.ceil(ph / sc));
        const sx = Math.max(0, Math.min(tex.width - cw, Math.floor((tex.width - cw) / 2) + ox - 12 * sc)), sy = Math.floor((tex.height - ch) / 2);
        this.fxImg.setTexture(fxKey, cropFrame(this.scene, fxKey, sx, sy, cw, ch)).setScale(sc).setVisible(true).setPosition(12, py).setCrop(0, 0, pw / sc, ph / sc);
        og.fillStyle(INK, 1); og.fillRect(10, py - 2, W - 20, 2); og.fillRect(10, py + ph, W - 20, 2); og.fillRect(10, py, 2, ph); og.fillRect(W - 12, py, 2, ph);
      } else { frame(12, py, W - 24, ph, shade(col, 0.75)); lines(false); }
      const k = (u - seg.face) / (seg.ball - seg.face), bx = Math.round(40 + (W - 80) * Math.pow(k, 0.8)), by = Math.round(py + ph / 2 + Math.sin(k * Math.PI * 2) * (this.kind === 'arcoiris' ? 26 : this.kind === 'relampago' ? 20 : 6));
      this.ball.setVisible(true).setScale(4).setPosition(bx, by).setFrame(Math.floor(t * 12) % 4);
      this.spawn(bx, by, dtn);
      this.hist.push([bx, by]); if (this.hist.length > 26) this.hist.shift();
      if (this.kind === 'arcoiris') {      // a ribbon of seven colours behind the ball
        const cols = PALETTES.arcoiris;
        for (let c = 0; c < cols.length; c++) { og.lineStyle(3, cols[c], 1); for (let i = 1; i < this.hist.length; i++) og.lineBetween(Math.round(this.hist[i - 1][0] - 8), Math.round(this.hist[i - 1][1] + (c - 3) * 3), Math.round(this.hist[i][0] - 8), Math.round(this.hist[i][1] + (c - 3) * 3)); }
      }
      if (this.kind === 'canonazo') for (let i = 0; i < 3; i++) { const r = 10 + ((t * 160 + i * 14) % 42); og.lineStyle(2, 0xffe45c, 1 - r / 56); og.strokeCircle(bx - 12 - i * 6, by, r); }
      this.drawParts(og, dtn);
      this.name.setVisible(true).setPosition(cx, 22).setScale(1);
      this.lastX = bx; this.lastY = by;
      if (this.kind === 'relampago') this.bolt(og, W, py, ph, t);
    } else if (phase === 'keeper') {
      lines(true);
      const kw = Math.min(W - 24, 280), kh = H - 60, kx = Math.round(cx - kw / 2), ky = 38 + 8;
      frame(kx, ky, kw, kh, shade(col, 0.7)); lines(true);
      const k = (u - seg.ball) / (seg.keeper - seg.ball), p = this.setPic(this.keep, info.keeperArt, info.keeperSprite, kh - 6, kw - 6);
      const slide = Math.round(Math.max(0, 1 - k * 4) * 120);
      this.keep.setPosition(Math.round(kx + (kw - p.w * p.s) / 2) + slide, Math.round(ky + (kh - p.h * p.s) / 2));
      this.drawParts(g, dtn);
      // the lightning of the moment the ball arrives
      if (k > 0.55) { g.lineStyle(3, 0xffffff, 1); g.lineBetween(kx + 20, ky + 6, kx + 60, ky + 36); g.lineBetween(kx + 60, ky + 36, kx + 36, ky + 44); g.lineBetween(kx + 36, ky + 44, kx + 84, ky + 84); g.lineStyle(1, 0xffe45c, 1); g.lineBetween(kx + 21, ky + 7, kx + 61, ky + 37); }
      this.name.setVisible(true).setPosition(cx, 22).setScale(1);
    } else {
      lines(true);
      this.drawParts(g, dtn);
      const goal = sp.outcome === 'goal', k = (u - seg.keeper) / (1 - seg.keeper);
      this.res.setText(goal ? '¡GOOOOL!' : '¡ATAJADA!').setFontSize(k < 0.3 ? 26 : k < 0.6 ? 34 : 40).setVisible(true).setPosition(cx, cy);
      // the shooter reacts: laughing after a goal, shocked after a save, popping in with a little overshoot
      const fk = faceKey(info.art);
      if (this.scene.textures.exists(fk)) {
        const fs = Math.max(1, Math.min(3, Math.floor(H * 0.42 / 80))), pop = k < 0.12 ? 0.6 + k / 0.12 * 0.5 : k < 0.2 ? 1.1 - (k - 0.12) * 1.25 : 1;
        this.face.setTexture(fk, goal ? 3 : 2).setScale(Math.max(1, Math.round(fs * pop))).setVisible(true).setPosition(Math.round(W * 0.2), Math.round(H - 26 - (goal ? Math.abs(Math.sin(t * 9)) * 6 : 0)));
      }
      if (!goal) for (let i = 0; i < 8; i++) { const a = t * 6 + i * 0.785, r = 60 + (i % 2) * 22; g.fillStyle(0xffe45c, 1).fillRect(Math.round(cx + Math.cos(a) * r) - 3, Math.round(cy + Math.sin(a) * r * 0.5) - 1, 6, 2).fillRect(Math.round(cx + Math.cos(a) * r) - 1, Math.round(cy + Math.sin(a) * r * 0.5) - 3, 2, 6); }
      else {
        // the net swells: a grid that bulges towards the viewer, and a white flash that fades
        g.fillStyle(0xffffff, Math.max(0, 0.5 - k * 0.7)).fillRect(0, 0, W, H);
        const bulge = Math.sin(Math.min(1, k * 2) * Math.PI) * 18; g.lineStyle(1, 0xffffff, 0.55);
        for (let i = 0; i <= 12; i++) { const x = Math.round((W / 12) * i); g.lineBetween(x, 0, Math.round(x + (x - cx) * bulge / 220), H); }
        for (let j = 0; j <= 8; j++) { const y = Math.round((H / 8) * j); g.lineBetween(0, y, W, Math.round(y + (y - cy) * bulge / 160)); }
      }
      this.name.setVisible(false);
    }
    this.drawRing(sp, W, H);
    // a white diagonal wipe at every cut and a dark vignette over everything
    if (!off) for (const b of [seg.flash, seg.face, seg.eyes, seg.boot, seg.ball, seg.keeper]) {
      const d = (u - b) * dur;
      if (b > 0 && b < 1 && d >= 0 && d < 0.12) { const x0 = Math.round(-60 + (d / 0.12) * (W + 120)); g.fillStyle(0xffffff, 0.95).fillTriangle(x0 - 30, H, x0 + 30, 0, x0 + 80, 0).fillTriangle(x0 - 30, H, x0 + 80, 0, x0 + 20, H); }
    }
    for (let i = 0; i < 4; i++) { g.fillStyle(0x000000, 0.16 - i * 0.035); const e = 6 + i * 8; g.fillRect(0, 0, W, e).fillRect(0, H - e, W, e).fillRect(0, 0, e, H).fillRect(W - e, 0, e, H); }
    this.last = t;
  }

  /** The AHORA ring: a circle that closes on the ball. A person presses Tiro or Especial when it meets the white one (the core rolls the result with the press). */
  private drawRing(sp: SpecialState, W: number, H: number): void {
    const rg = sp.ring;
    if (!rg) return;
    const k = rg.easy ? 3 : 1, t = sp.t, show = 0.5 * k, cx = Math.round(W / 2), cy = Math.round(H / 2);
    const col = rg.who === 'atk' ? 0xffe45c : 0x7be3ff, g = this.top;
    if (t >= rg.center - show && t <= rg.end + 0.1 && !rg.hit) {
      const u = Math.max(0, Math.min(1, (rg.center - t) / show)), r = Math.round(14 + 86 * u), inWin = Math.abs(t - rg.center) <= rg.perfect;
      g.lineStyle(5, INK, 1).strokeCircle(cx, cy, 14); g.lineStyle(5, INK, 1).strokeCircle(cx, cy, r + 3);
      g.lineStyle(3, inWin ? 0xffffff : col, 1).strokeCircle(cx, cy, r); g.lineStyle(2, 0xffffff, 1).strokeCircle(cx, cy, 14);
      this.ahora.setVisible(true).setText(rg.who === 'atk' ? '¡AHORA!' : '¡ATAJA!').setColor(inWin ? '#ffffff' : rg.who === 'atk' ? '#ffe45c' : '#7be3ff').setPosition(cx - Math.min(W * 0.3, 150), cy).setScale(inWin ? 1.2 : 1);
    } else if (rg.hit && t <= rg.end + 0.6) {
      const txt = rg.hit === 'perfect' ? '¡PERFECTO!' : rg.hit === 'good' ? '¡BIEN!' : rg.who === 'atk' ? 'Casi...' : '¡Casi!';
      this.ahora.setVisible(true).setText(txt).setColor(rg.hit === 'perfect' ? '#ffffff' : rg.hit === 'good' ? '#5ddb43' : '#cfc5e6').setPosition(cx - Math.min(W * 0.3, 150), cy).setScale(1);
      const u = Math.min(1, (t - rg.end) / 0.3), r = Math.round(14 + 40 * u);
      if (rg.hit !== 'miss') { g.lineStyle(4, rg.hit === 'perfect' ? 0xffffff : col, 1 - u).strokeCircle(cx, cy, r); }
    }
    if (rg.hit && this.ringSeen !== `${sp.shooter}:${rg.hit}`) { this.ringSeen = `${sp.shooter}:${rg.hit}`; services.audio?.play(rg.hit === 'perfect' ? 'impact' : rg.hit === 'good' ? 'tick' : 'whoosh'); }
  }

  /** The two extreme close-ups: a band across the eyes at x4, then the boot and the ball at the moment of impact. */
  private closeUp(which: 'eyes' | 'boot', g: Phaser.GameObjects.Graphics, W: number, H: number, k: number, col: number, shade: (c: number, k: number) => number, dt: number): void {
    const info = this.info!, art = info.art, m = this.meta[art], has = !!m && this.scene.textures.exists(`cine_${art}`), cx = W / 2, cy = H / 2;
    const bandH = Math.round(Math.min(H - 56, which === 'eyes' ? 128 : 150)), by = Math.round(cy - bandH / 2) + 6;
    g.fillStyle(0x0d0716, 1).fillRect(0, 0, W, H);
    g.fillStyle(shade(col, which === 'eyes' ? 0.5 : 0.65), 1).fillRect(0, by, W, bandH);
    // diagonal speed lines, in the manner of an anime close-up
    g.lineStyle(2, shade(col, 1.3), 1);
    for (let i = 0; i < 22; i++) { const x = Math.round(((i * 97 + this.last * 700) % (W + 200)) - 100), y = by + ((i * 41) % bandH); g.lineBetween(x, y, x - 46 - (i % 3) * 20, y + 8 + (i % 2) * 6); }
    g.fillStyle(INK, 1).fillRect(0, by - 3, W, 3).fillRect(0, by + bandH, W, 3);
    if (has) {
      if (which === 'eyes') {
        const s = 4, cw = Math.floor(W / s), ch = Math.floor(bandH / s), drift = Math.floor(k * 5);
        const sx = Math.max(0, Math.min(m.w - cw, m.headX - Math.floor(cw / 2) + drift)), sy = Math.max(0, Math.min(m.h - ch, m.headY - Math.floor(ch * 0.5) + 11));
        const fr = cropFrame(this.scene, `cine_${art}`, sx, sy, Math.min(cw, m.w), Math.min(ch, m.h));
        this.img.setTexture(`cine_${art}`, fr).setScale(s).setVisible(true).setPosition(Math.round(cx - Math.min(cw, m.w) * s / 2), by);
        // a glint crosses the eyes
        const gx = Math.round(cx - 40 + k * 120);
        g.fillStyle(0xffffff, 0.9).fillRect(gx, by + 8, 3, bandH - 16).fillRect(gx + 8, by + 8, 1, bandH - 16);
      } else {
        const s = H < 330 ? 2 : 3, ch = Math.floor(bandH / s), cw = Math.floor((W * 0.8) / s), sy = Math.max(0, m.h - ch), sx = Math.max(0, Math.min(m.w - cw, Math.floor(m.w / 2 - cw / 2)));
        const fr = cropFrame(this.scene, `cine_${art}`, sx, sy, Math.min(cw, m.w), Math.min(ch, m.h));
        this.img.setTexture(`cine_${art}`, fr).setScale(s).setVisible(true).setPosition(Math.round(W * 0.06) - Math.round(Math.max(0, 0.5 - k) * 40), by + bandH - Math.min(ch, m.h) * s);
      }
    } else {
      const p = this.setPic(this.img, null, info.shooterSprite, bandH, W * 0.5);
      this.img.setPosition(Math.round(cx - (p.w * p.s) / 2), by + bandH - p.h * p.s);
    }
    if (which === 'boot') {
      // the contact: a white burst of rings and rays where the foot meets the ball (the ball itself is in the illustration)
      const bx = this.img.x + Math.round(this.img.displayWidth * 0.44), byy = this.img.y + Math.round(this.img.displayHeight * 0.74);
      if (k >= 0.4) {
        const r = (k - 0.4) / 0.6;
        g.lineStyle(3, 0xffffff, 1 - r); g.strokeCircle(bx, byy, 14 + r * 80); g.lineStyle(2, 0xffe45c, 1 - r); g.strokeCircle(bx, byy, 8 + r * 50);
        for (let i = 0; i < 12; i++) { const a = i * 0.5236, r0 = 28 + r * 34; g.lineStyle(3, 0xffffff, 1 - r); g.lineBetween(Math.round(bx + Math.cos(a) * r0), Math.round(byy + Math.sin(a) * r0), Math.round(bx + Math.cos(a) * (r0 + 30)), Math.round(byy + Math.sin(a) * (r0 + 30))); }
        g.fillStyle(0xffffff, Math.max(0, 0.6 - r * 2)).fillRect(0, 0, W, H);
      }
    }
    this.name.setVisible(true).setPosition(cx, by + bandH + 16).setScale(1);
    void dt;
  }

  private bolt(g: Phaser.GameObjects.Graphics, W: number, py: number, ph: number, t: number): void {
    const x0 = 24 + ((t * 300) % (W - 120)), pts: [number, number][] = [[x0, py + 8], [x0 + 20, py + ph / 2 - 10], [x0 + 6, py + ph / 2 - 6], [x0 + 30, py + ph - 8]];
    for (const [w, c] of [[4, 0xffffff], [2, 0xffe45c]] as const) { g.lineStyle(w, c, 1); for (let i = 0; i < pts.length - 1; i++) g.lineBetween(Math.round(pts[i][0]), Math.round(pts[i][1]), Math.round(pts[i + 1][0]), Math.round(pts[i + 1][1])); }
  }

  private spawn(x: number, y: number, dt: number): void {
    const pal = PALETTES[this.kind];
    const shape = SHAPE[this.kind];
    for (let i = 0; i < 5; i++) {
      if (this.parts.length > 160) this.parts.shift();
      this.parts.push({ x: x - 6 - Math.random() * 12, y: y + (Math.random() - 0.5) * 18, vx: -50 - Math.random() * 90, vy: (Math.random() - 0.5) * 60 + (shape === 'leaf' ? 20 : 0), life: 0.5, max: 0.5, col: pal[(this.parts.length + i) % pal.length], s: shape === 'sq' ? 3 + Math.floor(Math.random() * 3) : 4 + Math.floor(Math.random() * 4), shape });
    }
    void dt;
  }

  private drawParts(g: Phaser.GameObjects.Graphics, dt: number): void {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.life <= 0) { this.parts.splice(i, 1); continue; }
      const a = Math.min(1, (p.life / p.max) * 2), x = Math.round(p.x), y = Math.round(p.y);
      if (p.shape === 'ring') { g.lineStyle(1, p.col, a); g.strokeCircle(x, y, p.s); }
      else if (p.shape === 'star') { g.fillStyle(p.col, a).fillRect(x - 1, y - p.s, 2, p.s * 2).fillRect(x - p.s, y - 1, p.s * 2, 2); }
      else if (p.shape === 'leaf') { g.fillStyle(p.col, a).fillRect(x, y, p.s, 2).fillRect(x + 1, y + 2, p.s - 2, 2); }
      else if (p.shape === 'grow') { g.fillStyle(p.col, a).fillRect(x, y, p.s + Math.round((1 - p.life / p.max) * 6), p.s + Math.round((1 - p.life / p.max) * 6)); }
      else g.fillStyle(p.col, a).fillRect(x, y, p.s, p.s);
    }
  }
}
