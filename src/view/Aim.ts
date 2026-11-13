import Phaser from 'phaser';
import type { Match, Player } from '../core/state';
import { T } from '../core/tuning';
import { PITCH, goalX } from '../core/field';
import { choosePass, stealTarget } from '../core/actions';
import { specialKind } from '../core/specials';
import { J_COLORS } from './colors';
import { wx, sy } from '../core/proj';
import { services } from '../app/services';

const INK = 0x2a1b3d;
const font = (px: number, color: string): Phaser.Types.GameObjects.Text.TextStyle => ({ fontFamily: 'Pixelify, sans-serif', fontSize: `${px}px`, fontStyle: 'bold', color, stroke: '#2A1B3D', strokeThickness: 3 });
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;

/**
 * What the player is about to do, drawn over the pitch for every human who has the ball (full controls):
 * a small mark over the teammate the pass would go to, the charge of the button (BAJO until a quarter second, ALTO after it, POTENCIA for the shot)
 * with the path of the pass (straight for the low one, an arc for the high one), and a glowing aura when the special is ready.
 * Pure view: it reads the state of the core and never changes it.
 */
export class Aim {
  /** Marks on the grass (aura, ring of the receiver): below every player, like the ring of the one you move. */
  private gg: Phaser.GameObjects.Graphics;
  private g: Phaser.GameObjects.Graphics;
  private label: Phaser.GameObjects.Text;
  private star: Phaser.GameObjects.Text;
  private lobCue = false;

  private who: Phaser.GameObjects.Text;
  constructor(private scene: Phaser.Scene) {
    this.who = scene.add.text(0, 0, '', font(9, '#2a1b3d')).setOrigin(0.5, 1).setDepth(902).setResolution(1).setVisible(false).setStroke('#ffffff', 0);
    this.gg = scene.add.graphics().setDepth(199.6);
    this.g = scene.add.graphics().setDepth(900);
    this.label = scene.add.text(0, 0, '', font(10, '#ffffff')).setOrigin(0.5, 1).setDepth(901).setResolution(1).setVisible(false);
    this.star = scene.add.text(0, 0, '', font(10, '#ffe45c')).setOrigin(0.5, 1).setDepth(901).setResolution(1).setVisible(false);
  }

  destroy(): void { this.gg.destroy(); this.g.destroy(); this.label.destroy(); this.star.destroy(); this.who.destroy(); }

  update(m: Match, time: number): void {
    const g = this.g; g.clear(); this.gg.clear();
    this.label.setVisible(false); this.star.setVisible(false); this.who.setVisible(false);
    // her player is out of the picture (the camera follows the ball; with the captain of Nekketsu it happens all the time): an arrow at the
    // edge of the screen, in her colour and with her number, points where he is
    if (m.phase === 'play' || m.phase === 'restart' || m.phase === 'kickoff') for (const p of m.players) if (p.control === 'human') this.edge(p, time);
    if (m.phase !== 'play') return;
    for (const p of m.players) {
      if (p.control !== 'human') continue;
      if (m.ball.owner === p.id && m.ball.state === 'owned') { this.one(m, p, time); continue; }
      // without the ball (full controls): an arc under the rival you can take the ball from at the front (the steal), and a line while you contain him
      if (p.controls !== 'full') continue;
      const c = stealTarget(m, p), col = J_COLORS[p.humanSlot ?? 0] ?? 0xffd447;
      if (c) { const k = 0.5 + 0.5 * Math.sin(time * 14); this.gg.lineStyle(2, col, 0.6 + 0.4 * k); this.gg.strokeEllipse(Math.round(wx(c.x, c.y)), Math.round(sy(c.y)), 26, 10); }
      if ((p.containT ?? 0) > 0) {
        const o = m.players.find((q) => q.id === m.ball.owner);
        if (o) { this.gg.lineStyle(2, col, 0.7); this.gg.lineBetween(Math.round(wx(p.x, p.y)), Math.round(sy(p.y)), Math.round(wx(o.x, o.y)), Math.round(sy(o.y))); }
      }
    }
  }

  private edge(p: Player, time: number): void {
    const v = this.scene.cameras.main.worldView, x = wx(p.x, p.y), y = sy(p.y, p.z) - 14, pad = 10;
    // the scoreboard hides the top and the bar of the NES (or the buttons) the bottom: the arrow stays inside what is left
    const x0 = v.x + pad, x1 = v.right - pad, y0 = v.y + v.height * 0.2, y1 = v.bottom - v.height * 0.16;
    if (x >= v.x - 4 && x <= v.right + 4 && y >= v.y + 6 && y <= v.bottom + 10) return;
    const cx = Math.max(x0, Math.min(x1, x)), cy = Math.max(y0, Math.min(y1, y)), a = Math.atan2(y - cy, x - cx);
    const col = J_COLORS[p.humanSlot ?? 0] ?? 0xffd447, k = 1 + 0.15 * Math.sin(time * 10), g = this.g;
    const tip = (r: number, da: number): [number, number] => [Math.round(cx + Math.cos(a + da) * r * k), Math.round(cy + Math.sin(a + da) * r * k)];
    const [ax, ay] = tip(9, 0), [bx, by] = tip(7, 2.5), [dx, dy] = tip(7, -2.5);
    g.fillStyle(INK, 1).fillTriangle(ax + Math.round(Math.cos(a) * 2), ay + Math.round(Math.sin(a) * 2), bx - Math.round(Math.cos(a) * 2), by + Math.sign(by - cy), dx - Math.round(Math.cos(a) * 2), dy + Math.sign(dy - cy));
    g.fillStyle(col, 1).fillTriangle(ax, ay, bx, by, dx, dy);
    g.fillStyle(INK, 1).fillCircle(Math.round(cx - Math.cos(a) * 6), Math.round(cy - Math.sin(a) * 6), 6).fillStyle(col, 1).fillCircle(Math.round(cx - Math.cos(a) * 6), Math.round(cy - Math.sin(a) * 6), 5);
    this.who.setText(String((p.humanSlot ?? 0) + 1)).setPosition(Math.round(cx - Math.cos(a) * 6), Math.round(cy - Math.sin(a) * 6) + 5).setVisible(true);
  }

  private one(m: Match, p: Player, time: number): void {
    const g = this.g, ground = this.gg, x = Math.round(wx(p.x, p.y)), gy = Math.round(sy(p.y)), col = J_COLORS[p.humanSlot ?? 0] ?? 0xffd447;
    const full = p.controls === 'full';
    const shooting = full && p.shoot.down, passing = full && p.pass.down;
    // the special is ready: a pulsing aura at the feet and a star over the head
    const ready = m.bar[p.team] >= T.bar.max && p.role !== 'gk';
    if (ready) {
      const inZone = specialKind(p) === 'arcoiris' || Math.abs(goalX(p.team) - p.x) <= PITCH.w * T.special.zone;
      const k = 0.5 + 0.5 * Math.sin(time * 6);
      ground.lineStyle(2, 0xffe45c, inZone ? 0.5 + 0.4 * k : 0.25);
      ground.strokeEllipse(x, gy, 26 + k * 6, 10 + k * 3);
      if (inZone) {
        ground.lineStyle(1, 0xffffff, 0.5 * k); ground.strokeEllipse(x, gy, 34 + k * 8, 14 + k * 4);
        if (!shooting && !passing) this.star.setVisible(true).setText('★ ESPECIAL').setPosition(x, Math.round(sy(p.y) - 60 - Math.round(k * 2)));
      }
    }
    // the teammate the pass would reach (small mark while no button is held, bright while the pass button is)
    const stick = p.input;
    const c = full ? choosePass(m, p, stick.mx, stick.my) : null;
    const lob = passing && p.pass.t >= T.lobHold;
    if (lob && !this.lobCue) { this.lobCue = true; services.audio?.play('lob'); } else if (!passing) this.lobCue = false;
    if (c) {
      const ty = Math.round(sy(c.y)), tx = Math.round(wx(c.x, c.y));
      const a = passing ? 1 : 0.5;
      g.fillStyle(col, a).fillTriangle(tx - 4, ty - 46, tx + 4, ty - 46, tx, ty - 40);
      g.lineStyle(1, INK, a).strokeTriangle(tx - 4, ty - 46, tx + 4, ty - 46, tx, ty - 40);
      if (passing) {
        ground.lineStyle(2, lob ? 0x7be3ff : 0xffffff, 0.95).strokeEllipse(tx, ty, 18, 7);
        const bx = Math.round(wx(m.ball.x, m.ball.y)), by = Math.round(sy(m.ball.y) - 4);
        const n = 12;
        let px = bx, py = by;
        for (let i = 1; i <= n; i++) {
          const u = i / n, qx = Math.round(lerp(bx, tx, u)), qy = Math.round(lerp(by, ty - 4, u) - (lob ? Math.sin(u * Math.PI) * 30 : 0));
          if (i % 2 && i > 2) { const L = lob ? g : ground; L.lineStyle(lob ? 2 : 3, lob ? 0x7be3ff : 0xffffff, 0.9); L.lineBetween(px, py, qx, qy); }   // the first steps would cross the body of the player; the low pass runs on the grass
          px = qx; py = qy;
        }
      }
    }
    // the charge of the button above the head
    if (shooting || passing) {
      const w = 22, bx = x - w / 2, by = Math.round(sy(p.y) - 52);
      const t = shooting ? p.shoot.t : p.pass.t;
      let fill: number, color: number, text: string;
      if (shooting) { fill = Math.min(1, t / T.autoFire); color = fill < 0.5 ? 0xffe45c : fill < 0.85 ? 0xff9a2e : 0xff4d2e; text = fill >= 0.98 ? '¡POTENCIA!' : 'TIRO'; }
      else { fill = Math.min(1, t / (T.lobHold * 2)); color = t >= T.lobHold ? 0x7be3ff : 0xffffff; text = t >= T.lobHold ? 'ALTO' : 'BAJO'; }
      g.fillStyle(INK, 1).fillRect(bx - 1, by - 1, w + 2, 6);
      g.fillStyle(0x4a3a5c, 1).fillRect(bx, by, w, 4);
      g.fillStyle(color, 1).fillRect(bx, by, Math.round(w * fill), 4);
      if (passing) g.fillStyle(0xffffff, 1).fillRect(bx + Math.round(w * 0.5), by - 1, 1, 6);
      if (shooting && fill >= 0.98 && Math.floor(time * 12) % 2) g.fillStyle(0xffffff, 0.9).fillRect(bx, by, w, 4);
      this.label.setVisible(true).setText(text).setColor(shooting ? (fill >= 0.98 ? '#ff9a7a' : '#ffe45c') : lob ? '#7be3ff' : '#ffffff').setPosition(x, by - 3);
    }
  }
}
