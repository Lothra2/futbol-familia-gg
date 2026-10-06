import Phaser from 'phaser';
import { pitchScreenTop } from '../../core/field';
import { newCam, shakeCamera, updateCamera, type Cam } from '../../core/camera';
import { KIND_INDEX } from '../../core/specials';
import { services } from '../../app/services';
import { MatchController, defaultConfig, type MatchConfig } from '../../app/controller';
import { Stadium } from '../Stadium';
import { PlayerView, COLORS, J_COLORS, type SpriteMeta } from '../PlayerView';
import { BallView } from '../BallView';
import { Fx } from '../Fx';
import { Cinematic, type CineInfo } from '../Cinematic';
import { Aim } from '../Aim';
import { PenView } from '../PenView';
import { PenCine } from '../PenCine';
import { FreeKickView } from '../FreeKickView';
import { Narrator } from '../../audio/narrator';
import { Recorder, ReplayOverlay, ReplayPlayer, type Snap } from '../Replay';
import { Training } from '../../app/training';
import { TrainingPanel } from '../../ui/trainingPanel';
import { GoalCine, type GoalInfo } from '../GoalCine';
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
  private stadium!: Stadium;
  private views: PlayerView[] = [];
  private ballView!: BallView;
  private fx!: Fx;
  cine!: Cinematic;
  goalCine!: GoalCine;
  private aim!: Aim;
  private fkView?: FreeKickView;
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
    this.stadium = new Stadium(this, this.cfg.stadium ?? 'volcan', this.cfg.time ?? Stadium.hourFor(this.cfg.stadium ?? 'volcan'), this.cfg.crowd ?? 'auto');
    this.fx = new Fx(this);
    for (const p of m.players) {
      // the rivals of the species with art use their own atlas (the keeper has the green one); the others fall back to the dragon until M9
      let key = p.team === 0 ? p.charId! : p.role === 'gk' ? `riv_${p.species}_gk` : `riv_${p.species}`;
      if (!this.textures.exists(key)) key = p.role === 'gk' ? 'riv_dragon_gk' : 'riv_dragon';
      const meta = this.cache.json.get(`${key}_meta`) as SpriteMeta;
      const outfit = p.team === 0 && p.charId ? this.cfg.outfits?.[p.charId] : undefined;
      const skin = outfit && outfit !== 'base' && this.textures.exists(`${key}_${outfit}`) ? `${key}_${outfit}` : key;
      const v = new PlayerView(this, p, skin, meta, this.fx);
      v.gold = p.team === 0 && !!p.charId && (this.cfg.levels?.[p.charId] ?? 1) >= 3;
      this.views.push(v);
    }
    this.ballView = new BallView(this, m.ball);
    this.cine = new Cinematic(this);
    this.goalCine = new GoalCine(this);
    this.aim = new Aim(this);
    this.fkView?.destroy(); this.fkView = new FreeKickView(this);
    this.pen = new PenView(this, [T_ES.teams.family, T_ES.teams[this.cfg.rival] ?? '']);
    this.penCine?.destroy(); this.penCine = new PenCine(this, this.cfg.stadium ?? 'volcan');
    this.ceremony = false; this.ceremonyT = 0;
    this.hitStop = 0; this.narrator.enabled = this.cfg.narrator !== false; this.narrator.volume = this.cfg.narratorVolume ?? 0.8; this.narrator.stop(); this.training = null; this.trainPanel?.destroy(); this.trainPanel = null;
    if (this.cfg.training) { this.training = new Training(m, m.humans.every((h) => h.controls === 'easy'), this.cfg.drill ?? 'todo'); this.trainPanel = new TrainingPanel(); }
    window.addEventListener('pointerdown', this.tapSkip); window.addEventListener('keydown', this.replayKey);
    this.rec.reset(); this.replay = null; this.pending = null; this.prevPhase = m.phase; this.replaySkip = false; this.replayUi = new ReplayOverlay(this);
    this.hud = getHud();
    this.hud.names(T_ES.teams.family, T_ES.teams[this.cfg.rival] ?? '');
    this.hud.show(true);
    this.scale.on('resize', this.layout, this);
    services.audio?.music(this.cfg.stadium ?? 'volcan'); services.audio?.crowd(true);
    services.app?.coach(this);
    this.events.once('shutdown', () => { this.penCine?.destroy(); this.penCine = undefined; this.fkView?.destroy(); this.fkView = undefined; services.audio?.crowd(false); this.narrator.stop(); this.trainPanel?.destroy(); this.trainPanel = null; window.removeEventListener('pointerdown', this.tapSkip); window.removeEventListener('keydown', this.replayKey); this.replayUi.destroy(); this.scale.off('resize', this.layout, this); this.hud.show(false); document.getElementById('result')?.remove(); });
    this.layout();
    updateCamera(this.cam, m, this.scale.width, 0, true);
    this.applyCamera();
  }

  private layout(): void {
    const w = this.scale.width, h = this.scale.height;
    this.cameras.main.setSize(w, h);
    this.stadium.layout(w, h);
  }

  private applyCamera(): void {
    const sh = this.cam.shake > 0 ? Math.round(Math.sin(this.time.now * 0.09) * 2) : 0;
    const x = Math.round(this.cam.x) + sh;
    this.cameras.main.setScroll(x, 0);
    this.stadium.scroll(x);
  }

  private onEvents(evs: MatchEvent[], top: number): void {
    const rnd = (): number => { this.viewRnd = (this.viewRnd * 1664525 + 1013904223) >>> 0; return this.viewRnd / 4294967296; };
    for (const e of evs) {
      services.audio?.onFx(e);
      this.narrator.onEvent(e, this.ctl.m, T_ES.teams[this.cfg.rival] ?? 'los rivales');
      this.fx.event(e, top, rnd, e.k === 'trail' && this.goldTrail(e.who));
      const B = T_ES.banners;
      if (!this.cfg.reducedMotion && !this.cfg.fastForward) this.hitStopFor(e);
      switch (e.k) {
        case 'goal': if (this.ctl.m.phase !== 'penalties') this.pending = this.rec.clip(2.8); if (this.cfg.cine === 'off' && this.ctl.m.phase !== 'penalties') this.hud.banner(B.goal, 2200); this.hud.flash(); shakeCamera(this.cam, 0.35); this.stadium.goal(this.scorerName(e.who), [...this.ctl.m.score] as [number, number]); break;
        case 'throwin': this.hud.banner(B.throwin, 900); break;
        case 'goalkick': this.hud.banner(B.goalkick, 900); break;
        case 'corner': this.hud.banner(B.corner, 900); break;
        case 'freekick': { this.hud.banner(B.freekick, 1100); const tk = this.ctl.m.players.find((q) => q.id === e.who); if (tk?.control === 'human') this.hud.hint(tk.controls === 'easy' ? B.freekickEasy : B.freekickFull, 2600); break; }
        case 'final': this.hud.banner(B.final, 1800); break;
        case 'whistle': if (e.v === 2) this.hud.banner(B.halftime, 1600); break;
        case 'special': this.stadium.gasp(); if (this.cfg.cine === 'off') this.hud.banner(T_ES.specials[KIND_INDEX[e.v ?? 0]] ?? '', 1500); this.hud.flash(180); shakeCamera(this.cam, 0.3); break;
        case 'special_far': this.hud.hint(B.far); break;
        case 'save': if (e.v !== 2 && this.ctl.m.phase !== 'penalties') this.hud.banner(B.save, 700); this.stadium.gasp(); break;
        case 'post': case 'bar': if (this.ctl.m.phase !== 'penalties') this.hud.banner(B.post, 600); shakeCamera(this.cam, 0.1); this.stadium.gasp(); break;
        case 'starfull': if (e.v === 0) this.hud.hint(T_ES.hints.star, 1500); break;
      }
    }
  }

  update(_t: number, delta: number): void {
    if (this.paused) return;
    try {
      const dt = Math.min(0.1, delta / 1000);
      const m: Match = this.ctl.m;
      const h = this.scale.height, top = pitchScreenTop(h);
      if (this.replay) { this.stepReplay(dt, delta, top); return; }
      if (this.hitStop > 0) {
        // frozen frame: the stadium and the HUD breathe, the match does not move
        this.hitStop -= dt; this.ctl.resetClock();
        this.stadium.update(delta, this.cfg.fpsCap ?? 0); this.hud.update(m);
        return;
      }
      const before = m.tick;
      const evs = this.ctl.advance(delta / 1000, this.cfg.ff);
      this.stepsRun += m.tick - before;
      this.onEvents(evs, top);
      updateCamera(this.cam, m, this.scale.width, dt * Math.max(1, Math.min(this.cfg.ff, 4)));
      this.applyCamera();
      for (const v of this.views) {
        const p = v.p;
        const slot = p.control === 'human' ? p.humanSlot : null;
        v.update(dt, top, slot, slot === null ? 0 : J_COLORS[slot] ?? COLORS[p.charId ?? 'sophie']);
      }
      this.stadium.update(delta, this.cfg.fpsCap ?? 0); this.stadium.setScore(m.score);
      this.ballView.update(top, m.flight ? m.flight.kind : null, m.t);
      this.updateCine(m, dt);
      if (m.phase === 'play') this.rec.record(m, dt);
      if (this.prevPhase === 'goal' && m.phase !== 'goal' && this.pending) {
        if (m.phase !== 'over' && this.cfg.replay !== false && this.cfg.cine !== 'off' && !this.cfg.fastForward && this.pending.length > 20) this.startReplay(this.pending);
        this.pending = null;
      }
      this.prevPhase = m.phase;
      this.aim.update(m, top, this.time.now / 1000);
      this.fkView?.update(m, top, this.time.now / 1000);
      if (this.training && this.trainPanel) {
        const v = this.training.update(m); this.trainPanel.update(v);
        if (v.justDone) { this.hud.banner(v.allDone ? '¡Entrenamiento completo!' : '¡Reto superado!', 1400); services.audio?.play('starfull'); }
        if (v.justDone && v.allDone) services.app?.trainingDone();
      }
      this.penCine?.update(m, this.scale.width, this.scale.height, this.time.now / 1000, dt, this.views);
      this.pen.update(m, top, this.scale.width, this.scale.height, this.time.now / 1000);
      if (this.ceremony) { this.ceremonyT -= dt; if (this.ceremonyT <= 0) { this.ceremonyT = 2.4; this.stadium.goal('¡CAMPEONES!', [...m.score] as [number, number]); } }
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
    // the goal: a cutscene of its own (not in the "sin cinemáticas" mode, which keeps the banner)
    if (m.phase === 'goal' && m.lastGoal && this.cfg.cine !== 'off') {
      if (!this.goalCine.active) { this.goalCine.start(this.goalInfo(m)); this.hud.cinema(true); }
      this.goalCine.update(m, this.scale.width, this.scale.height, m.phaseT >= T.goalSkip);
    } else if (this.goalCine.active) { this.goalCine.stop(); if (!this.cine.active) this.hud.cinema(false); }
  }

  private goalInfo(m: Match): GoalInfo {
    const lg = m.lastGoal!, mine = lg.team === 0;
    const byId = (id: number | null): Player | undefined => m.players.find((q) => q.id === id);
    const sc = byId(lg.scorer) ?? m.players.find((q) => q.team === lg.team && q.role !== 'gk')!;
    const base = this.cineInfo(sc.id, null);
    return { ...base, scorer: lg.scorer === null ? (mine ? T_ES.teams.family : T_ES.teams[this.cfg.rival] ?? '') : sc.name, assist: byId(lg.assist)?.name ?? null,
      us: T_ES.teams.family, them: T_ES.teams[this.cfg.rival] ?? '', mine };
  }

  private startReplay(clip: Snap[]): void {
    this.replay = new ReplayPlayer(clip, 0.5); this.replaySkip = false;
    this.hud.cinema(true); this.replayUi.show(true); services.audio?.play('whoosh');
  }

  /** One frame of the replay: the match waits, the recorded players and ball are drawn at half speed. */
  private stepReplay(dt: number, delta: number, top: number): void {
    const rp = this.replay!, W = this.scale.width, H = this.scale.height;
    const f = rp.step(dt, W), cam = Math.round(rp.camX);
    this.cameras.main.setScroll(cam, 0); this.stadium.scroll(cam); this.stadium.update(delta, this.cfg.fpsCap ?? 0);
    this.views.forEach((v, i) => { v.p = f.ps[i]; v.update(dt * rp.speed, top, null, 0); });
    this.ballView.setBall(f.ball); this.ballView.update(top, f.kind, f.rt);
    this.replayUi.draw(W, H, rp.t, rp.speed);
    if (rp.done || this.replaySkip) this.endReplay(top);
  }

  private endReplay(top: number): void {
    const m = this.ctl.m;
    this.replay = null; this.replaySkip = false;
    this.views.forEach((v, i) => { v.p = m.players[i]; });
    this.ballView.setBall(m.ball); this.ballView.update(top, null, m.t);
    this.replayUi.show(false); this.hud.cinema(false); this.ctl.resetClock();
    updateCamera(this.cam, m, this.scale.width, 0, true); this.applyCamera();
    services.audio?.play('whoosh');
  }

  /** A short freeze on the hardest moments: a power shot, a goal, a post, a bump. */
  private hitStopFor(e: MatchEvent): void {
    const m = this.ctl.m, v = e.v ?? 0;
    let t = 0;
    if (e.k === 'kick' && v > 500 && m.phase === 'play') t = 0.07;
    else if (e.k === 'goal' && m.phase !== 'penalties') t = 0.12;
    else if ((e.k === 'post' || e.k === 'bar') && v > 300 && m.phase === 'play') t = 0.06;
    else if (e.k === 'bump') t = 0.06;
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
