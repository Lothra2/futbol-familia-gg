import Phaser from 'phaser';
import type { Match, SpecialKind } from '../core/state';
import { depthAt, wx, sy } from '../core/proj';

/** The names of the effects of public/assets/fx (tools/build_pixelfx.py makes them from pixelfx, MIT). */
export const PFX = ['carga', 'destello', 'plasma', 'pilar', 'aro_fuego', 'rayo', 'chispa', 'ola', 'chapuzon', 'hojas', 'plumas', 'estrellas', 'confeti', 'cohete', 'pow', 'golpe', 'polvo'] as const;
export type PfxName = (typeof PFX)[number];
export interface PfxMeta { w: number; h: number; px: number; py: number; frames: number; fps: number; cols: number; loop: boolean }

/** What each power does when it leaves the boot and when it gets to the goal. */
export const POWER_FX: Record<SpecialKind, { go: PfxName; hit: PfxName }> = {
  arcoiris: { go: 'destello', hit: 'cohete' }, burbuja: { go: 'chapuzon', hit: 'chapuzon' }, canonazo: { go: 'destello', hit: 'plasma' },
  estrellas: { go: 'destello', hit: 'estrellas' }, carrera: { go: 'polvo', hit: 'pow' }, relampago: { go: 'chispa', hit: 'rayo' },
  llamarada: { go: 'aro_fuego', hit: 'pilar' }, ola: { go: 'chapuzon', hit: 'ola' }, picada: { go: 'plumas', hit: 'plumas' }, hojas: { go: 'hojas', hit: 'hojas' },
};

/** How long each effect takes to show its strong part (s): the bolt takes a third of a second to fall, the wave almost one to break. One that
 *  marks the arrival of a power starts that much before the ball gets there, and one that marks a moment that has just happened (a kick,
 *  a goal) starts already that far in. So the bang is on the beat. */
export const PFX_LEAD: Partial<Record<PfxName, number>> = { pilar: 0.4, rayo: 0.33, ola: 0.9, estrellas: 0.8, cohete: 0.3, chapuzon: 0.2, aro_fuego: 0.4, confeti: 0.2, hojas: 0.1 };

interface Live { img: Phaser.GameObjects.Image; name: PfxName; t: number; loops: number }

/** The big effects of the powers: sheets of pixel art played once (or a few turns) on the pitch, at a place of the world. Pooled. */
export class PixelFx {
  private live: Live[] = []; private pool: Phaser.GameObjects.Image[] = [];
  private meta: Record<string, PfxMeta>;
  /** The glow of a power that is loading, at the feet of whoever loads it. */
  private aura: Phaser.GameObjects.Image | null = null; private auraT = 0;
  private wasFlight: Match['flight'] = null; private hitDone = false;
  constructor(private scene: Phaser.Scene) { this.meta = (scene.cache.json.get('pfx_meta') as Record<string, PfxMeta>) ?? {}; }

  private ready(name: PfxName): PfxMeta | null { const m = this.meta[name]; return m && this.scene.textures.exists(`pfx_${name}`) ? m : null; }

  /** Plays `name` with its foot at the world point (x, y, z). `flip`: mirrored (it looks the other way); `loops`: turns of a looping one. */
  play(name: PfxName, x: number, y: number, z = 0, o: { flip?: boolean; loops?: number; front?: boolean; scale?: number; at?: number } = {}): void {
    const m = this.ready(name); if (!m) return;
    if (this.live.length >= 10) { const old = this.live.shift()!; old.img.setVisible(false); this.pool.push(old.img); }
    const img = this.pool.pop() ?? this.scene.add.image(0, 0, `pfx_${name}`);
    const fx = !!o.flip;
    img.setTexture(`pfx_${name}`, 0).setOrigin((fx ? m.w - m.px : m.px) / m.w, m.py / m.h).setFlipX(fx).setScale(o.scale ?? 1).setAlpha(1).setVisible(true)
      .setPosition(Math.round(wx(x, y)), Math.round(sy(y, z))).setDepth(o.front ? 2500 : depthAt(y) + 0.8);
    this.live.push({ img, name, t: o.at ?? 0, loops: o.loops ?? 1 }); img.setFrame(Math.min(m.frames - 1, Math.floor((o.at ?? 0) * m.fps)));
  }

  update(m: Match, dt: number): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const l = this.live[i], me = this.meta[l.name]; l.t += dt;
      const f = Math.floor(l.t * me.fps);
      if (f >= me.frames * l.loops) { l.img.setVisible(false); this.pool.push(l.img); this.live.splice(i, 1); continue; }
      l.img.setFrame(f % me.frames);
      // the last turn fades out
      if (l.loops > 1 && f >= me.frames * (l.loops - 1)) l.img.setAlpha(1 - (f % me.frames) / me.frames);
    }
    // the glow at the feet of whoever loads his power
    const sp = m.special, am = this.ready('carga');
    if (sp && am) {
      const s = m.players.find((p) => p.id === sp.shooter);
      if (s) {
        this.aura ??= this.scene.add.image(0, 0, 'pfx_carga').setOrigin(am.px / am.w, am.py / am.h);
        this.auraT += dt * (1 + sp.t / sp.dur);
        this.aura.setVisible(true).setFrame(Math.floor(this.auraT * am.fps) % am.frames).setPosition(Math.round(wx(s.x, s.y)) + s.facing * 4, Math.round(sy(s.y, s.z)) - 2).setDepth(depthAt(s.y) - 0.2);
      }
    } else if (this.aura?.visible) this.aura.setVisible(false);
    // a power leaves the boot, and a power gets to the goal
    const f = m.flight;
    if (f && f !== this.wasFlight) { this.hitDone = false; const go = POWER_FX[f.kind].go; this.play(go, f.x0, f.y0, 0, { flip: f.x1 < f.x0, loops: f.kind === 'hojas' ? 2 : 1, at: PFX_LEAD[go] ?? 0 }); }
    const w = f ?? this.wasFlight;
    if (w && !this.hitDone) {
      const hit = POWER_FX[w.kind].hit, lead = PFX_LEAD[hit] ?? 0, left = f ? f.dur - f.t : 0;
      if (left <= lead) { this.hitDone = true; this.play(hit, w.x1, w.y1, 0, { flip: w.x1 < w.x0, loops: w.kind === 'hojas' ? 2 : 1, at: Math.max(0, lead - left) }); }
    }
    if (!f && this.wasFlight?.outcome === 'save') this.play('pow', this.wasFlight.x1, this.wasFlight.y1, 14, { front: true });
    this.wasFlight = f;
  }

  clear(): void { for (const l of this.live) { l.img.setVisible(false); this.pool.push(l.img); } this.live = []; this.aura?.setVisible(false); this.wasFlight = null; this.hitDone = false; }
}
