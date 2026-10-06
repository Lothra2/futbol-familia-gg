import Phaser from 'phaser';
import type { Match } from '../core/state';
import { cropFrame, faceKey, type CineInfo } from './Cinematic';
import { services } from '../app/services';

const INK = 0x2a1b3d;
const font = (px: number, color = '#ffffff', stroke = '#2A1B3D'): Phaser.Types.GameObjects.Text.TextStyle => ({ fontFamily: 'Pixelify, sans-serif', fontSize: `${px}px`, fontStyle: 'bold', color, stroke, strokeThickness: Math.max(3, Math.round(px / 7)) });
const ease = (k: number): number => 1 - Math.pow(1 - Math.max(0, Math.min(1, k)), 3);
const shade = (c: number, k: number): number => { const r = ((c >> 16) & 255) * k, g = ((c >> 8) & 255) * k, b = (c & 255) * k; return (Math.min(255, r) << 16) | (Math.min(255, g) << 8) | Math.min(255, b); };

export interface GoalInfo extends CineInfo {
  scorer: string; assist: string | null; us: string; them: string; mine: boolean;
}

/**
 * The goal as a cutscene (in the spirit of the 8-bit cinemas of Ninja Gaiden): the screen goes dark, bars close in, a sunburst of the colour of the scorer
 * turns behind his illustration, a hard cut goes to a close-up of the face, the word GOOOOL slams in with a diagonal slash and the score is typed out.
 * It is a pure function of the time of the goal phase (`m.phaseT`), so pause stops it and skip ends it. Pictures use whole-number scales.
 */
export class GoalCine {
  private root: Phaser.GameObjects.Container;
  private g: Phaser.GameObjects.Graphics;
  private img: Phaser.GameObjects.Image;
  private shadow: Phaser.GameObjects.Text;
  private big: Phaser.GameObjects.Text;
  private who: Phaser.GameObjects.Text;
  private sub: Phaser.GameObjects.Text;
  private hint: Phaser.GameObjects.Text;
  private info: GoalInfo | null = null;
  private meta: Record<string, { w: number; h: number; headX: number; headY: number }>;
  private text = '';
  private cues = 0;
  active = false;

  constructor(private scene: Phaser.Scene) {
    this.meta = (scene.cache.json.get('cine_meta') as GoalCine['meta']) ?? {};
    this.g = scene.add.graphics();
    this.img = scene.add.image(0, 0, 'ball').setOrigin(0, 0).setVisible(false);
    this.shadow = scene.add.text(0, 0, '', font(64, '#2A1B3D')).setOrigin(0.5).setResolution(1);
    this.big = scene.add.text(0, 0, '', font(64, '#ffe45c')).setOrigin(0.5).setResolution(1);
    this.who = scene.add.text(0, 0, '', font(26)).setOrigin(0.5).setResolution(1);
    this.sub = scene.add.text(0, 0, '', font(18, '#ffe9a8')).setOrigin(0.5).setResolution(1);
    this.hint = scene.add.text(0, 0, '', font(12, '#cfc5e6')).setOrigin(1, 1).setResolution(1);
    this.root = scene.add.container(0, 0, [this.g, this.img, this.shadow, this.big, this.who, this.sub, this.hint]).setDepth(5200).setScrollFactor(0).setVisible(false);
  }

  pictures(): Phaser.GameObjects.Image[] { return [this.img]; }

  start(info: GoalInfo): void {
    this.active = true; this.info = info; this.cues = 0; this.root.setVisible(true).setPosition(0, 0);
    this.big.setText(info.mine ? '¡GOOOOL!' : '¡GOL!'); this.shadow.setText(this.big.text);
    this.who.setText(''); this.sub.setText(''); this.hint.setText('');
  }

  stop(): void { this.active = false; this.info = null; this.root.setVisible(false); this.g.clear(); this.img.setVisible(false); }

  /** Types `s` out at `cps` characters per second since `t0`. */
  private typed(s: string, t: number, t0: number, cps = 34): string { return s.slice(0, Math.max(0, Math.floor((t - t0) * cps))); }

  update(m: Match, W: number, H: number, canSkip: boolean): void {
    if (!this.active || !this.info) return;
    const info = this.info, g = this.g, t = m.phaseT, col = info.color, cx = W / 2;
    g.clear();
    // the sound of the cutscene: the word slams in at 0.3 s, the cut at 1.45 s, the score ticks in at 1.6 s
    if (this.cues < 1 && t >= 0.3) { this.cues = 1; services.audio?.play('slam'); services.audio?.play('roar'); }
    if (this.cues < 2 && t >= 1.42) { this.cues = 2; services.audio?.play('whoosh'); }
    if (this.cues < 3 && t >= 1.6) { this.cues = 3; services.audio?.play('tick'); }
    // darkness comes in, the bars close
    const dim = Math.min(0.82, t / 0.18);
    g.fillStyle(0x080410, dim).fillRect(0, 0, W, H);
    const bar = Math.round(ease(t / 0.22) * Math.max(26, H * 0.17));
    const bandTop = bar, bandBot = H - bar, bandH = bandBot - bandTop, cy = Math.round((bandTop + bandBot) / 2);
    // sunburst turning behind the picture
    const cut = t >= 1.45;
    g.fillStyle(shade(col, 0.42), 1).fillRect(0, bandTop, W, bandH);
    const wedges = 18, rot = t * (cut ? 0.7 : 0.35), R = W + H;
    g.fillStyle(shade(col, 0.72), 1);
    for (let i = 0; i < wedges; i += 2) {
      const a0 = rot + (i / wedges) * Math.PI * 2, a1 = rot + ((i + 1) / wedges) * Math.PI * 2;
      g.fillTriangle(Math.round(cx), cy, Math.round(cx + Math.cos(a0) * R), Math.round(cy + Math.sin(a0) * R), Math.round(cx + Math.cos(a1) * R), Math.round(cy + Math.sin(a1) * R));
    }
    // the bars clip the burst: paint them over
    g.fillStyle(0x080410, 1).fillRect(0, 0, W, bandTop).fillRect(0, bandBot, W, H - bandBot);
    g.fillStyle(col, 1).fillRect(0, bandTop - 3, W, 3).fillRect(0, bandBot, W, 3);
    // horizontal speed lines racing past
    g.lineStyle(2, shade(col, 1.3), 0.9);
    for (let i = 0; i < 16; i++) { const y = bandTop + 6 + ((i * 53) % Math.max(10, bandH - 12)), x = Math.round(W - ((t * 1100 + i * 97) % (W + 160))); g.lineBetween(x, y, x + 60 + (i % 4) * 26, y); }

    // the picture
    const art = info.art, m0 = this.meta[art], has = !!m0 && this.scene.textures.exists(`cine_${art}`);
    this.img.setVisible(false);
    if (has) {
      if (!cut) {
        const s = Math.max(1, Math.floor((bandH - 4) / m0.h)), dw = m0.w * s, dh = m0.h * s;
        const slide = Math.round((1 - ease((t - 0.1) / 0.4)) * W * 0.6), drift = Math.round(Math.max(0, t - 0.5) * 10);
        this.img.setTexture(`cine_${art}`).setFrame('__BASE').setScale(s).setVisible(t > 0.1).setPosition(Math.round(W * 0.28 - dw / 2) + slide - drift, Math.round(cy - dh / 2));
      } else if (this.scene.textures.exists(faceKey(art)) && info.mine) {
        // the cut goes to the portrait of the scorer laughing (the strip of faces), a hand-drawn expression instead of a crop of the full figure
        const s = Math.max(2, Math.min(4, Math.floor((bandH - 8) / 80)));
        const bob = Math.round(Math.abs(Math.sin((t - 1.45) * 7)) * 3);
        this.img.setTexture(faceKey(art), t < 1.75 ? 2 : 3).setScale(s).setVisible(true).setPosition(Math.round(W * 0.28 - 40 * s), Math.round(cy - 40 * s) - bob);
      } else {
        const s = 2, cw = Math.min(m0.w, Math.floor(W * 0.42 / s)), ch = Math.min(m0.h, Math.floor((bandH - 4) / s)), drift = Math.floor((t - 1.45) * 6);
        const sx = Math.max(0, Math.min(m0.w - cw, m0.headX - Math.floor(cw / 2) + drift)), sy = Math.max(0, Math.min(m0.h - ch, m0.headY - Math.floor(ch * 0.42)));
        this.img.setTexture(`cine_${art}`, cropFrame(this.scene, `cine_${art}`, sx, sy, cw, ch)).setScale(s).setVisible(true).setPosition(Math.round(W * 0.28 - cw * s / 2), Math.round(cy - ch * s / 2));
      }
    } else if (info.shooterSprite) {
      const s = Math.max(1, Math.floor((bandH - 8) / 48));
      this.img.setTexture(info.shooterSprite.key, info.shooterSprite.frame).setScale(s).setVisible(true).setPosition(Math.round(W * 0.28 - 24 * s), Math.round(cy - 24 * s));
    }

    // GOOOOL slams in: three jumps of size, then a shake
    const t0 = 0.3, k = t - t0;
    const size = Math.round(Math.min(W / 10.5, bandH * 0.5));
    if (k < 0) { this.big.setVisible(false); this.shadow.setVisible(false); }
    else {
      const sc = k < 0.05 ? 3 : k < 0.1 ? 2 : k < 0.15 ? 1.35 : 1;
      const shake = k < 0.7 ? (Math.round(t * 60) % 2 ? 3 : -3) * (1 - k / 0.7) : 0;
      const bx = Math.round(W * 0.67 + shake), by = Math.round(cy - bandH * 0.12);
      this.big.setVisible(true).setFontSize(Math.round(size * sc)).setPosition(bx, by).setColor(info.mine ? '#ffe45c' : '#ffffff');
      this.shadow.setVisible(true).setFontSize(Math.round(size * sc)).setPosition(bx + 4, by + 5).setColor(`#${shade(col, 0.9).toString(16).padStart(6, '0')}`);
    }
    // names and score are typed out
    this.who.setPosition(Math.round(W * 0.67), Math.round(cy + bandH * 0.2)).setFontSize(Math.max(14, Math.round(size * 0.42)));
    this.sub.setPosition(Math.round(W * 0.67), Math.round(cy + bandH * 0.38)).setFontSize(Math.max(11, Math.round(size * 0.27)));
    this.who.setText(this.typed(info.scorer.toUpperCase(), t, 0.7));
    const line = info.assist && t > 1.05 ? `Pase de ${info.assist}` : '';
    const score = t > 1.6 ? `${info.us} ${m.score[0]} - ${m.score[1]} ${info.them}` : '';
    this.text = score || line;
    this.sub.setText(score ? this.typed(score, t, 1.6, 40) : this.typed(line, t, 1.05));

    // transitions: a white flash at the start and on the cut, a diagonal slash that wipes across at the cut, one lightning at 0.9 s
    const flash = (a: number): void => { if (a > 0) g.fillStyle(0xffffff, Math.min(1, a)).fillRect(0, 0, W, H); };
    flash(t < 0.12 ? 1 - t / 0.2 : 0); flash(t >= 1.45 && t < 1.55 ? 0.9 - (t - 1.45) * 6 : 0);
    if (t >= 1.40 && t < 1.55) {
      const p = (t - 1.40) / 0.15, x0 = Math.round(-80 + p * (W + 160));
      g.fillStyle(0xffffff, 1).fillTriangle(x0 - 40, H, x0 + 40, 0, x0 + 90, 0).fillTriangle(x0 - 40, H, x0 + 90, 0, x0 + 10, H);
    }
    if (t > 0.9 && t < 0.98) { g.lineStyle(4, 0xffffff, 1); const lx = Math.round(W * 0.5); g.lineBetween(lx, 0, lx - 18, bandTop + bandH * 0.4); g.lineBetween(lx - 18, bandTop + bandH * 0.4, lx + 10, bandTop + bandH * 0.55); g.lineBetween(lx + 10, bandTop + bandH * 0.55, lx - 12, H); }
    this.hint.setText(canSkip && t > 1.0 ? '▶ toca para seguir' : '').setPosition(W - 10, H - 5);
    this.root.setPosition(0, 0);
    void INK;
  }
}
