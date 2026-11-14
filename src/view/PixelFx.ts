import Phaser from 'phaser';
import type { Match, SpecialKind } from '../core/state';
import { depthAt, wx, sy } from '../core/proj';

/** The names of the effects of public/assets/fx (tools/build_pixelfx.py makes them from pixelfx, MIT). */
export const PFX = ['carga', 'destello', 'plasma', 'pilar', 'aro_fuego', 'rayo', 'chispa', 'ola', 'chapuzon', 'hojas', 'plumas', 'estrellas', 'confeti', 'cohete', 'pow', 'golpe', 'polvo', 'ondas'] as const;
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

type PlayOpts = { flip?: boolean; loops?: number; front?: boolean; scale?: number; at?: number };
interface Logged { rt: number; name: PfxName; x: number; y: number; z: number; o: PlayOpts }
interface Live { img: Phaser.GameObjects.Image; name: PfxName; t: number; loops: number }

/** The big effects of the powers: sheets of pixel art played once (or a few turns) on the pitch, at a place of the world. Pooled. */
export class PixelFx {
  private live: Live[] = []; private pool: Phaser.GameObjects.Image[] = [];
  private meta: Record<string, PfxMeta>;
  /** The glow of a power that is loading, at the feet of whoever loads it. */
  private aura: Phaser.GameObjects.Image | null = null; private auraT = 0;
  private wasFlight: Match['flight'] = null; private hitDone = false;
  /** Every effect of the last seconds with the time of the recording it came at (`clock`), so the replay of a goal shows the same ones at
   *  the same moments, and not whatever was on the screen when the replay began. */
  private log: Logged[] = []; private queue: Logged[] | null = null;
  clock = 0;
  constructor(private scene: Phaser.Scene) { this.meta = (scene.cache.json.get('pfx_meta') as Record<string, PfxMeta>) ?? {}; }

  private ready(name: PfxName): PfxMeta | null { const m = this.meta[name]; return m && this.scene.textures.exists(`pfx_${name}`) ? m : null; }

  /** Plays `name` with its foot at the world point (x, y, z). `flip`: mirrored (it looks the other way); `loops`: turns of a looping one. */
  play(name: PfxName, x: number, y: number, z = 0, o: PlayOpts = {}): void {
    const m = this.ready(name); if (!m) return;
    if (!this.queue) { this.log.push({ rt: this.clock, name, x, y, z, o: { ...o } }); while (this.log.length && this.log[0].rt < this.clock - 6) this.log.shift(); }
    if (this.live.length >= 10) { const old = this.live.shift()!; old.img.setVisible(false); this.pool.push(old.img); }
    const img = this.pool.pop() ?? this.scene.add.image(0, 0, `pfx_${name}`);
    const fx = !!o.flip;
    img.setTexture(`pfx_${name}`, 0).setOrigin((fx ? m.w - m.px : m.px) / m.w, m.py / m.h).setFlipX(fx).setScale(o.scale ?? 1).setAlpha(1).setVisible(true)
      .setPosition(Math.round(wx(x, y)), Math.round(sy(y, z))).setDepth(o.front ? 2500 : depthAt(y) + 0.8);
    this.live.push({ img, name, t: o.at ?? 0, loops: o.loops ?? 1 }); img.setFrame(Math.min(m.frames - 1, Math.floor((o.at ?? 0) * m.fps)));
  }

  /** Moves the effects that are playing on by `dt`. */
  private run(dt: number): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const l = this.live[i], me = this.meta[l.name]; l.t += dt;
      const f = Math.floor(l.t * me.fps);
      if (f >= me.frames * l.loops) { l.img.setVisible(false); this.pool.push(l.img); this.live.splice(i, 1); continue; }
      l.img.setFrame(f % me.frames);
      // the last turn fades out
      if (l.loops > 1 && f >= me.frames * (l.loops - 1)) l.img.setAlpha(1 - (f % me.frames) / me.frames);
    }
  }

  /** The glow at the feet of whoever loads his power (`u`: how far, 0 to 1), or none. */
  private glow(s: { x: number; y: number; z: number; facing: number } | undefined, u: number, dt: number): void {
    const am = this.ready('carga');
    if (!s || !am) { this.aura?.setVisible(false); return; }
    this.aura ??= this.scene.add.image(0, 0, 'pfx_carga').setOrigin(am.px / am.w, am.py / am.h);
    this.auraT += dt * (1 + u);
    this.aura.setVisible(true).setFrame(Math.floor(this.auraT * am.fps) % am.frames).setPosition(Math.round(wx(s.x, s.y)) + s.facing * 4, Math.round(sy(s.y, s.z)) - 2).setDepth(depthAt(s.y) - 0.2);
  }

  /** The replay of a goal begins at `rt0` of the recording: what is on the screen goes away and the effects of that stretch wait their turn
   *  (one that had begun a little before comes in already going). */
  replayStart(rt0: number): void {
    const log = this.log; this.clear(); this.log = log;
    this.queue = log.filter((e) => e.rt >= rt0 - 1.5).map((e) => ({ ...e }));
    for (const e of this.queue) if (e.rt < rt0) { e.o = { ...e.o, at: (e.o.at ?? 0) + (rt0 - e.rt) }; e.rt = rt0; }
  }
  /** One frame of the replay, at `rt` of the recording: the effects whose moment has come start, and all of them run at the speed of the replay. */
  replayStep(rt: number, sp: { x: number; y: number; z: number; facing: number } | undefined, u: number, dt: number): void {
    const q = this.queue; if (!q) return;
    while (q.length && q[0].rt <= rt + 0.02) { const e = q.shift()!; this.queue = null; this.play(e.name, e.x, e.y, e.z, e.o); this.log.pop(); this.queue = q; }
    this.run(dt); this.glow(sp, u, dt);
  }
  replayEnd(): void { this.queue = null; this.clear(); }

  update(m: Match, dt: number): void {
    this.run(dt);
    const sp = m.special;
    this.glow(sp ? m.players.find((p) => p.id === sp.shooter) : undefined, sp ? sp.t / sp.dur : 0, dt);
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

  clear(): void { for (const l of this.live) { l.img.setVisible(false); this.pool.push(l.img); } this.live = []; this.aura?.setVisible(false); this.wasFlight = null; this.hitDone = false; this.log = []; }
}
