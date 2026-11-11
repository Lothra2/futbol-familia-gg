import Phaser from 'phaser';
import { newCam, shakeCamera, updateCamera, type Cam } from '../../core/camera';
import { KIND_INDEX } from '../../core/specials';
import { services } from '../../app/services';
import { MatchController, defaultConfig, type MatchConfig } from '../../app/controller';
import { TopPitch, type TimeOfDay } from '../TopPitch';
import { NesPlayer, type NesMeta } from '../NesPlayer';
import { COLORS, J_COLORS } from '../colors';
import type { WorldId } from '../worlds';
import { BallView } from '../BallView';
import { Fx } from '../Fx';
import { WeatherView } from '../WeatherView';
import { setView, wx, sy } from '../../core/proj';
import { outfitAtlas } from '../outfit';
import { Cinematic, type CineInfo } from '../Cinematic';
import { Aim } from '../Aim';
import { PenView } from '../PenView';
import { PenCine } from '../PenCine';
import { Narrator } from '../../audio/narrator';
import { Recorder, ReplayOverlay, ReplayPlayer, type Snap } from '../Replay';
import { Training } from '../../app/training';
import { TrainingPanel } from '../../ui/trainingPanel';
import { Hud } from '../../ui/hud';
import { T_ES } from '../../data/text.es';
import type { Match, Player } from '../../core/state';
import { T } from '../../core/tuning';
import type { MatchEvent } from '../../core/types';

let hud: Hud | null = null;
const getHud = (): Hud => (hud ??= new Hud());

/** The match on the screen: runs the controller at the fixed step and draws the state of the core. Nothing here decides anything about the game. */
export class MatchScene extends Phaser.Scene {
  paused = false;
  cfg: MatchConfig = defaultConfig();
  ctl!: MatchController;
  cam: Cam = newCam();
  private stadium!: TopPitch;
  private views: NesPlayer[] = [];
  private ballView!: BallView;
  private fx!: Fx;
  private weather!: WeatherView; private lastCam = { x: 0, y: 0 };
  cine!: Cinematic;
  private aim!: Aim;
  private pen!: PenView;
  private penCine?: PenCine;
  private training: Training | null = null; private trainPanel: TrainingPanel | null = null;
  /** The Cup ceremony: fireworks and cheering while the final result is on the screen. */
  ceremony = false; private ceremonyT = 0;
  /** Seconds the picture stays frozen after a hard hit (the simulation waits too, so nothing is lost). */
  private hitStop = 0;
  private narrator = new Narrator();
  /** The replay of the goal: the last seconds of play are recorded and shown again in slow motion before the kick-off. */
  private rec = new Recorder(); private replay: ReplayPlayer | null = null; private replayUi!: ReplayOverlay; private pending: Snap[] | null = null; private prevPhase = ''; private replaySkip = false;
  private replayKey = (e: KeyboardEvent): void => { if (this.replay && ['Space', 'Enter', 'KeyJ', 'KeyK', 'KeyF', 'KeyG', 'Comma', 'Period', 'Escape'].includes(e.code)) this.replaySkip = true; };
  private tapSkip = (e: Event): void => { if ((e.target as HTMLElement | null)?.id === 'pause') return; if (this.replay) { this.replaySkip = true; return; } const r = services.router; if (!r || (this.ctl?.m.phase !== 'cinematic' && this.ctl?.m.phase !== 'goal')) return; r.setButton(0, 'cineskip', 'shoot', true); window.setTimeout(() => r.setButton(0, 'cineskip', 'shoot', false), 80); };
  private hud!: Hud;
  private stepsRun = 0;
  private resultShown = false;
  private overT = 0;
  private lastTick = 0;
  private viewRnd = 1;

  constructor() { super('Match'); }

  init(data: { cfg?: MatchConfig }): void { this.cfg = data?.cfg ?? defaultConfig(); }

  create(): void {
    // Phaser reuses the Scene object when it restarts: every lazy field is reset here.
    this.paused = false; this.stepsRun = 0; this.resultShown = false; this.overT = 0; this.views = []; this.cam = newCam(); this.viewRnd = 7;
    this.ctl = new MatchController(this.cfg, this.cfg.autoplay ? null : services.router);
    const m = this.ctl.m;
    this.stadium = new TopPitch(this, (this.cfg.stadium ?? 'volcan') as WorldId, this.cfg.time as TimeOfDay | undefined);
    this.fx = new Fx(this);
    this.weather = new WeatherView(this, m.weather, m.ball.wind ?? 0);
    for (const p of m.players) {
      // every player has his own atlas from forja (tools/nes): the five of the family, Thor, and the six kids of each kingdom
      let key = `nes_${p.art}`;
      if (!this.textures.exists(key)) key = p.role === 'gk' ? 'nes_riv_dragon_gk' : 'nes_riv_dragon_1';
      const meta = this.cache.json.get(`${key}_meta`) as NesMeta;
      // the outfit won in the Vitrina repaints the shirt of the family member (view/outfit.ts)
      const outfit = p.team === 0 && p.charId ? this.cfg.outfits?.[p.charId] : undefined;
      const skin = outfit && outfit !== 'base' ? outfitAtlas(this, key, p.art, outfit) : key;
      const v = new NesPlayer(this, p, skin, meta, this.fx);
      v.gold = p.team === 0 && !!p.charId && (this.cfg.levels?.[p.charId] ?? 1) >= 3;
      this.views.push(v);
    }
    this.ballView = new BallView(this, m.ball);
    this.cine = new Cinematic(this);
    this.aim = new Aim(this);
    this.pen = new PenView(this, [T_ES.teams.family, T_ES.teams[this.cfg.rival] ?? '']);
    this.penCine?.destroy(); this.penCine = new PenCine(this, this.cfg.stadium ?? 'volcan');
    this.ceremony = false; this.ceremonyT = 0; this.pows = [];
    this.hitStop = 0; this.narrator.enabled = this.cfg.narrator !== false; this.narrator.volume = this.cfg.narratorVolume ?? 0.8; this.narrator.stop(); this.training = null; this.trainPanel?.destroy(); this.trainPanel = null;
    if (this.cfg.training) { this.training = new Training(m, m.humans.every((h) => h.controls === 'easy'), this.cfg.drill ?? 'todo'); this.trainPanel = new TrainingPanel(); }
    window.addEventListener('pointerdown', this.tapSkip); window.addEventListener('keydown', this.replayKey);
    this.rec.reset(); this.replay = null; this.pending = null; this.prevPhase = m.phase; this.replaySkip = false; this.replayUi = new ReplayOverlay(this);
    this.hud = getHud();
    this.hud.names(T_ES.teams.family, T_ES.teams[this.cfg.rival] ?? '');
    if (m.weather === 'viento') this.hud.hint(`Viento ${m.ball.wind! > 0 ? '→' : '←'}`, 2600); else if (m.weather === 'lluvia') this.hud.hint('Lluvia: el balón rueda menos', 2600);
    this.hud.show(true);
    this.scale.on('resize', this.layout, this);
    services.audio?.music(this.cfg.stadium ?? 'volcan'); services.audio?.crowd(true);
    services.app?.coach(this);
    this.events.once('shutdown', () => { this.penCine?.destroy(); this.penCine = undefined; services.audio?.crowd(false); this.narrator.stop(); this.trainPanel?.destroy(); this.trainPanel = null; window.removeEventListener('pointerdown', this.tapSkip); window.removeEventListener('keydown', this.replayKey); this.replayUi.destroy(); this.scale.off('resize', this.layout, this); this.hud.show(false); document.getElementById('result')?.remove(); });
    this.layout();
    this.follow(0, true);
    this.applyCamera();
  }

  private layout(): void {
    const w = this.scale.width, h = this.scale.height;
    this.cameras.main.setSize(w, h);
    this.stadium.layout(w, h);
    this.weather?.layout(w, h);
  }

  /** The band the HUD of the bottom covers (names, minimap and clock, like Nintendo World Cup): the camera centres the ball above it. */
  private get inset(): number { return this.hud?.bottomInset(this.scale.height) ?? 0; }

  private follow(dt: number, first = false): void { updateCamera(this.cam, this.ctl.m, this.scale.width, dt, first, this.scale.height, this.inset); }

  private applyCamera(): void {
    const sh = this.cam.shake > 0 ? Math.round(Math.sin(this.time.now * 0.09) * 2) : 0;
    this.cameras.main.setScroll(Math.round(this.cam.x) + sh, Math.round(this.cam.y));
    setView(Math.round(this.cam.x) + this.scale.width / 2, Math.round(this.cam.y) + (this.scale.height - this.inset) / 2, this.scale.height);
  }

  private onEvents(evs: MatchEvent[]): void {
    const rnd = (): number => { this.viewRnd = (this.viewRnd * 1664525 + 1013904223) >>> 0; return this.viewRnd / 4294967296; };
    for (const e of evs) {
      services.audio?.onFx(e);
      this.narrator.onEvent(e, this.ctl.m, T_ES.teams[this.cfg.rival] ?? 'los rivales');
      this.fx.event(e, rnd, e.k === 'trail' && this.goldTrail(e.who));
      const B = T_ES.banners;
      if (!this.cfg.reducedMotion && !this.cfg.fastForward) this.hitStopFor(e);
      switch (e.k) {
        case 'goal': if (this.ctl.m.phase !== 'penalties') this.pending = this.rec.clip(2.8); if (this.ctl.m.phase !== 'penalties') this.hud.banner(B.goal, 2200); this.hud.flash(); shakeCamera(this.cam, 0.35); this.stadium.goal(); break;
        case 'throwin': this.hud.banner(B.throwin, 900); break;
        case 'goalkick': this.hud.banner(B.goalkick, 900); break;
        case 'corner': this.hud.banner(B.corner, 900); break;
        case 'final': this.hud.banner(B.final, 1800); break;
        case 'whistle': if (e.v === 2) this.hud.banner(B.halftime, 1600); else if (e.v === 1 && this.ctl.m.phase === 'kickoff' && this.cfg.cine !== 'off') this.hud.banner(B.kickoff, 1100); break;
        case 'special': this.stadium.gasp(); if (this.cfg.cine === 'off') this.hud.banner(T_ES.specials[KIND_INDEX[e.v ?? 0]] ?? '', 1500); this.hud.flash(180); shakeCamera(this.cam, 0.3); break;
        case 'special_far': this.hud.hint(B.far); break;
        case 'save': {
          if (e.v !== 2 && this.ctl.m.phase !== 'penalties') this.hud.banner(B.save, 700); this.stadium.gasp();
          // Thor barks when he stops one
          const k = this.ctl.m.players.find((q) => q.id === e.who); if (k?.art === 'thor') this.pow(k.x, k.y, '¡GUAU!', '#ffe45c');
          this.ballView.wobble();
          break;
        }
        case 'post': case 'bar': if (this.ctl.m.phase !== 'penalties') this.hud.banner(B.post, 600); shakeCamera(this.cam, 0.1); this.stadium.gasp(); this.ballView.wobble(); break;
        case 'deflect': this.ballView.wobble(); break;
        case 'thud': shakeCamera(this.cam, 0.06); break;
        case 'smother': { const k = this.ctl.m.players.find((q) => q.id === e.who); this.pow(e.x, e.y, k?.art === 'thor' ? '¡MÍA!' : '¡FUERA!', '#ffe45c'); break; }
        case 'spinkick': this.pow(e.x, e.y, '¡GIRO!', '#ffe45c'); shakeCamera(this.cam, 0.12); break;
        case 'starfull': if (e.v === 0) this.hud.hint(T_ES.hints.star, 1500); break;
        case 'super': this.hud.banner(T_ES.specials[KIND_INDEX[e.v ?? 0]] ?? '¡SÚPER PATADA!', 1000); this.hud.flash(120); shakeCamera(this.cam, 0.3); this.stadium.gasp(); break;
        case 'superready': { const p = this.ctl.m.players.find((q) => q.id === e.who); if (p?.control === 'human') this.pow(e.x, e.y, '¡YA!', '#ffe45c'); break; }
        case 'superhit': case 'slidehit': this.pow(e.x, e.y, ['¡PUM!', '¡POW!', '¡ZAS!'][Math.floor(Math.random() * 3)], '#ffffff'); break;
        case 'steal': this.pow(e.x, e.y, '¡PUM!', '#ffffff'); break;
      }
    }
  }

  update(_t: number, delta: number): void {
    if (this.paused) return;
    try {
      const dt = Math.min(0.1, delta / 1000);
      const m: Match = this.ctl.m;
      if (this.replay) { this.stepReplay(dt); return; }
      if (this.hitStop > 0) {
        // frozen frame: the stadium and the HUD breathe, the match does not move
        this.hitStop -= dt; this.ctl.resetClock();
        this.stadium.update(dt); this.hud.update(m);
        return;
      }
      const before = m.tick;
      const evs = this.ctl.advance(delta / 1000, this.cfg.ff);
      this.stepsRun += m.tick - before;
      this.onEvents(evs);
      this.follow(dt * Math.max(1, Math.min(this.cfg.ff, 4)));
      this.applyCamera();
      for (const v of this.views) {
        const p = v.p;
        // Thor holding the ball is driven by the person of the family (ai/keeper.ts): he wears the marker of the first one
        const thorHolds = p.role === 'gk' && p.team === 0 && m.ball.state === 'held' && m.ball.owner === p.id ? m.humans.find((h) => h.team === 0) : undefined;
        const slot = p.control === 'human' ? p.humanSlot : thorHolds ? thorHolds.slot : null;
        v.forceDir = m.phase === 'penalties' && m.pen ? (p.id === m.pen.shooter ? 6 : p.id === m.pen.keeper ? 2 : null) : null;
        v.update(dt * this.ctl.pace, m, slot, slot === null ? 0 : J_COLORS[slot] ?? COLORS[p.charId ?? 'sophie']);
      }
      this.stadium.update(dt);
      this.weather.update(dt, this.scale.width, this.scale.height, this.cam.x - this.lastCam.x, this.cam.y - this.lastCam.y); this.lastCam = { x: this.cam.x, y: this.cam.y };
      this.ballView.update(m.flight ? m.flight.kind : null, m.t);
      this.updateCine(m, dt);
      if (m.phase === 'play') this.rec.record(m, dt);
      if (this.prevPhase === 'goal' && m.phase !== 'goal' && this.pending) {
        if (m.phase !== 'over' && this.cfg.replay !== false && this.cfg.cine !== 'off' && !this.cfg.fastForward && this.pending.length > 20) this.startReplay(this.pending);
        this.pending = null;
      }
      this.prevPhase = m.phase;
      this.aim.update(m, this.time.now / 1000);
      if (this.training && this.trainPanel) {
        const v = this.training.update(m); this.trainPanel.update(v);
        if (v.justDone) { this.hud.banner(v.allDone ? '¡Entrenamiento completo!' : '¡Reto superado!', 1400); services.audio?.play('starfull'); }
        if (v.justDone && v.allDone) services.app?.trainingDone();
      }
      this.penCine?.update(m, this.scale.width, this.scale.height, this.time.now / 1000, dt, this.views);
      this.pen.update(m, 0, this.scale.width, this.scale.height, this.time.now / 1000);
      if (this.ceremony) { this.ceremonyT -= dt; if (this.ceremonyT <= 0) { this.ceremonyT = 2.4; this.stadium.goal(); } }
      this.fx.update(dt);
      this.hud.update(m);
      if (m.phase === 'over') this.overT += dt;
      if (m.phase === 'over' && !this.resultShown && this.overT > 1.2) {
        this.resultShown = true;
        if (services.app) services.app.finish(m); else this.hud.result(m, () => undefined, () => undefined);
      }
      this.lastTick = m.tick;
    } catch (e) { console.error('update failed', e); }
  }

  /** Shows the cinematic while the match is in that phase and puts it away afterwards. */
  private updateCine(m: Match, dt: number): void {
    const sp = m.special;
    if (m.phase === 'cinematic' && sp) {
      if (!this.cine.active && this.cfg.cine !== 'off') { this.cine.start(sp, this.cineInfo(sp.shooter, sp.keeper)); this.hud.cinema(true); }
      if (this.cine.active) this.cine.update(sp, this.scale.width, this.scale.height, dt);
    } else if (this.cine.active) { this.cine.stop(); this.hud.cinema(false); }
  }

  private startReplay(clip: Snap[]): void {
    this.replay = new ReplayPlayer(clip, 0.5, 0.7, this.scale.width, this.scale.height); this.replaySkip = false;
    this.hud.cinema(true); this.replayUi.show(true); services.audio?.play('whoosh');
  }

  /** One frame of the replay: the match waits, the recorded players and ball are drawn at half speed. */
  private stepReplay(dt: number): void {
    const rp = this.replay!, W = this.scale.width, H = this.scale.height;
    const f = rp.step(dt, W, H);
    this.cameras.main.setScroll(Math.round(rp.camX), Math.round(rp.camY)); setView(Math.round(rp.camX) + W / 2, Math.round(rp.camY) + H / 2, H); this.stadium.update(dt);
    this.views.forEach((v, i) => { v.p = f.ps[i]; v.update(dt * rp.speed, null, null, 0); });
    this.ballView.setBall(f.ball); this.ballView.update(f.kind, f.rt);
    this.replayUi.draw(W, H, rp.t, rp.speed);
    if (rp.done || this.replaySkip) this.endReplay();
  }

  private endReplay(): void {
    const m = this.ctl.m;
    this.replay = null; this.replaySkip = false;
    this.views.forEach((v, i) => { v.p = m.players[i]; });
    this.ballView.setBall(m.ball); this.ballView.update(null, m.t);
    this.replayUi.show(false); this.hud.cinema(false); this.ctl.resetClock();
    this.follow(0, true); this.applyCamera();
    services.audio?.play('whoosh');
  }

  /** The words of a hit, Nekketsu style: big pixel letters that jump out of the player and fade. */
  private pows: Phaser.GameObjects.Text[] = [];
  private pow(x: number, y: number, word: string, color: string): void {
    const t = this.pows.find((o) => !o.visible) ?? (this.pows.length < 6 ? this.pows[this.pows.push(this.add.text(0, 0, '', { fontFamily: 'Pixelify, sans-serif', fontSize: '16px', fontStyle: 'bold', color: '#fff', stroke: '#2A1B3D', strokeThickness: 4 }).setOrigin(0.5, 1).setResolution(1).setDepth(1500)) - 1] : this.pows[0]);
    this.tweens.killTweensOf(t);
    t.setText(word).setColor(color).setVisible(true).setAlpha(1).setScale(0.6).setPosition(Math.round(wx(x, y)), Math.round(sy(y) - 34));
    this.tweens.add({ targets: t, scale: 1.15, y: t.y - 14, duration: 180, ease: 'Back.Out', onComplete: () => this.tweens.add({ targets: t, alpha: 0, duration: 380, delay: 220, onComplete: () => t.setVisible(false) }) });
  }

  /** A short freeze on the hardest moments: a power shot, a goal, a post, a bump. */
  private hitStopFor(e: MatchEvent): void {
    const m = this.ctl.m, v = e.v ?? 0;
    let t = 0;
    if (e.k === 'kick' && v > 500 && m.phase === 'play') t = 0.07;
    else if (e.k === 'goal' && m.phase !== 'penalties') t = 0.12;
    else if ((e.k === 'post' || e.k === 'bar') && v > 300 && m.phase === 'play') t = 0.06;
    else if (e.k === 'bump') t = 0.06;
    else if (e.k === 'super') t = 0.16;
    else if (e.k === 'superhit' || e.k === 'slidehit') t = 0.08;
    else if (e.k === 'spinkick') t = 0.09;
    else if (e.k === 'save' && v !== 2 && m.phase === 'play') t = 0.05;
    if (t > this.hitStop) this.hitStop = t;
  }

  /** Level 5 gives the family special a golden trail. */
  private goldTrail(id: number | undefined): boolean {
    const p = this.ctl.m.players.find((q) => q.id === id);
    return !!p && p.team === 0 && !!p.charId && (this.cfg.levels?.[p.charId] ?? 1) >= 5;
  }

  private scorerName(id: number | undefined): string {
    const p = this.ctl.m.players.find((q) => q.id === id);
    return p ? p.name : this.ctl.m.lastGoal?.team === 1 ? 'DRAGON' : 'GOL';
  }

  private cineInfo(shooterId: number, keeperId: number | null): CineInfo {
    const m = this.ctl.m, p = m.players.find((q) => q.id === shooterId)!, k = keeperId === null ? null : m.players.find((q) => q.id === keeperId) ?? null;
    const has = (key: string): boolean => this.textures.exists(`cine_${key}`);
    const COLORS_ID: Record<string, number> = { sophie: 0x4fd65c, alana: 0xff6fb5, papa: 0xe8423a, mama: 0x9b5de5, juandi: 0x2f6fe0, thor: 0x3fb6f2, dragon: 0xff8a2a, tiburon: 0x2f8fe0, buho: 0xd9a05b, mapache: 0x8aa0a8 };
    const art = p.team === 0 ? (p.charId === 'thor' ? 'thor_a' : p.charId!) : `riv_${p.species}_a`;
    const kart = k ? (k.team === 0 ? 'thor_b' : `riv_${k.species}_b`) : null;
    return {
      art: has(art) ? art : '', keeperArt: kart && has(kart) ? kart : null,
      shooterSprite: { key: p.team === 0 ? p.charId! : 'riv_dragon', frame: 5 }, keeperSprite: { key: k && k.team === 0 ? 'thor' : 'riv_dragon', frame: 7 },
      color: COLORS_ID[p.charId ?? p.species ?? 'sophie'] ?? 0x4fd65c,
    };
  }

  setPaused(on: boolean): void { this.paused = on; if (!on) this.ctl?.resetClock(); }
  get steps(): number { return this.stepsRun; }
  get match(): Match { return this.ctl.m; }
  get ticks(): number { return this.lastTick; }
}
