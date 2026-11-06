import Phaser from 'phaser';
import { createMatch, step, type MatchOptions } from '../../core/match';
import { updateCamera, newCam, type Cam } from '../../core/camera';
import { DT } from '../../core/step';
import { setView } from '../../core/proj';
import { TopPitch, type TimeOfDay } from '../TopPitch';
import { NesPlayer, type NesMeta } from '../NesPlayer';
import { BallView } from '../BallView';
import type { WorldId } from '../worlds';
import type { Match } from '../../core/state';
import { services } from '../../app/services';

const RIVAL: Record<WorldId, MatchOptions['away']> = { volcan: 'dragon', bosque: 'mapache', arrecife: 'tiburon', nubes: 'buho' };

/**
 * The background of every menu, like the attract mode of the NES games: a real match of the family against the kingdom of the stadium, played
 * by the AI on the pitch of that kingdom and seen from above. Decorative only (no input, no score on screen): the DOM screens sit on top.
 */
export class MenuScene extends Phaser.Scene {
  private pitch!: TopPitch;
  private m!: Match;
  private views: NesPlayer[] = [];
  private ball!: BallView;
  private cam: Cam = newCam();
  private acc = 0;
  private id: WorldId = 'volcan';
  private time_: TimeOfDay | undefined;

  constructor() { super('Menu'); }

  init(data: { stadium?: WorldId; time?: TimeOfDay }): void { this.id = data?.stadium ?? 'volcan'; this.time_ = data?.time; }

  create(): void {
    this.views = []; this.acc = 0; this.cam = newCam();
    this.m = createMatch({ ai: 'brain', seed: (Date.now() & 0xffff) + 1, halfLength: 100000, away: RIVAL[this.id], difficulty: 'normales' });
    this.cameras.main.setBackgroundColor('#000000');
    this.pitch = new TopPitch(this, this.id, this.time_);
    for (const p of this.m.players) {
      let key = `nwc_${p.art}`;
      if (!this.textures.exists(key)) key = p.role === 'gk' ? 'nwc_riv_dragon_gk' : 'nwc_riv_dragon_1';
      this.views.push(new NesPlayer(this, p, key, this.cache.json.get(`${key}_meta`) as NesMeta));
    }
    this.ball = new BallView(this, this.m.ball);
    services.audio?.crowd(false); services.audio?.music('menu');
    this.scale.on('resize', this.layout, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.layout, this));
    this.layout();
    updateCamera(this.cam, this.m, this.scale.width, 0, true, this.scale.height);
  }

  private layout(): void {
    const w = this.scale.width, h = this.scale.height;
    this.cameras.main.setSize(w, h);
    this.pitch.layout(w, h);
  }

  update(_t: number, delta: number): void {
    // the NES menus are opaque black screens: while one covers the game the demo does not run (it would only spend the battery)
    const covered = !!document.querySelector('#ui .menu2');
    this.cameras.main.setVisible(!covered);
    if (covered) return;
    const dt = Math.min(0.1, delta / 1000), m = this.m;
    // the demo match runs at the fixed step of the core, a little slower than real time so it reads as a calm warm-up
    this.acc += dt * 0.85;
    while (this.acc >= DT) { this.acc -= DT; step(m); if (m.events.some((e) => e.k === 'goal')) this.pitch.goal(); m.events = []; }
    updateCamera(this.cam, m, this.scale.width, dt * 0.6, false, this.scale.height);
    this.cameras.main.setScroll(Math.round(this.cam.x), Math.round(this.cam.y));
    setView(Math.round(this.cam.x) + this.scale.width / 2, Math.round(this.cam.y) + this.scale.height / 2, this.scale.height);
    for (const v of this.views) v.update(dt, m, null, 0);
    this.ball.update(m.flight ? m.flight.kind : null, m.t);
    this.pitch.update(dt);
  }
}
