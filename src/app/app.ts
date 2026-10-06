import type Phaser from 'phaser';
import type { InputRouter } from '../input/router';
import type { TouchUI } from '../input/touch';
import type { KeyboardInput } from '../input/keyboard';
import type { GamepadInput } from '../input/gamepad';
import type { SaveStore } from '../save/save';
import type { Shell } from './shell';
import type { BotKind } from '../core/ai/testbots';
import type { CharId } from '../core/types';
import type { TeamKind } from '../core/teams';
import { SPECIES } from '../core/types';
import { cleanSquad, defaultConfig, type MatchConfig } from './controller';
import { FIELD_CHARS, type FieldChar } from '../core/teams';
import { services } from './services';
import { T_ES } from '../data/text.es';
import { Screens } from '../ui/screens';
import { KINGDOMS } from '../data/kingdoms';
import { applyMatch } from './progress';
import { applyDaily } from './daily';
import { cupMatchResult } from './cup';
import { showResult, showCredits } from '../ui/result';
import { showTrainingDone } from '../ui/trainingPanel';
import { runCoach } from '../ui/guide';
import type { Match } from '../core/state';
import type { MatchScene } from '../view/scenes/MatchScene';

type Opt<T> = { v: T; label: string };

/** Menu of the first test and the flow match -> result -> again or menu. M7 replaces the menu with the real one (kingdoms, Copa, settings). */
export class App {
  cfg: MatchConfig = defaultConfig();
  private ui = document.getElementById('ui')!;
  private shell: Shell | null = null;
  screens!: Screens;
  /** Tests only: a bot plays the human seats and the clock runs fast, also for the matches started from the menu and the Cup. */
  private test: Partial<MatchConfig> | null = null;

  constructor(private game: Phaser.Game, private router: InputRouter, private touch: TouchUI, private kb: KeyboardInput, private pad: GamepadInput, private store: SaveStore) {
    services.app = { again: () => this.again(), menu: () => this.showMenu(), finish: (m) => this.finish(m), trainingDone: () => this.trainingDone(), coach: (sc) => this.coach(sc) };
    this.screens = new Screens({ game, store, touch, cfg: () => this.cfg, setCfg: (c) => { this.cfg = c; }, play: (c) => this.startMatch(c, true), train: (n) => this.startTraining(n), credits: () => this.credits() });
  }
  setShell(s: Shell): void { this.shell = s; }

  /** `?mode=quick` skips the menu: players, controls, difficulty, half, seed, ff, autoplay, cine, rival and chars come from the URL. */
  boot(q: URLSearchParams): void {
    this.game.scene.stop('Boot');
    const s = this.store.data.settings;
    services.audio?.setVolumes(s.music, s.sfx, s.muted, s.crowd);
    if (q.has('autoplay') && q.get('mode') !== 'quick') { const a = q.get('autoplay'); this.test = { autoplay: a === 'sophie' || a === 'quieto' ? (a as BotKind) : 'nina5', ff: Math.max(1, Number(q.get('ff')) || 1), ...(Number(q.get('half')) > 0 ? { half: Number(q.get('half')) } : {}) }; }
    this.cfg = { ...defaultConfig(), controls: [s.controls[0], s.controls[1]], difficulty: s.difficulty, half: s.halfLength, mirror: s.mirrorP2 };
    if (q.get('mode') === 'quick') {
      const c = this.cfg;
      c.players = q.get('players') === '2' ? 2 : 1;
      const ctl = (q.get('controls') ?? '').split(',').filter((x) => x === 'easy' || x === 'full') as ('easy' | 'full')[];
      if (ctl.length) c.controls = [ctl[0], ctl[1] ?? ctl[0]];
      const d = q.get('difficulty'); if (d === 'tranquilos' || d === 'normales' || d === 'campeones') c.difficulty = d;
      const h = Number(q.get('half')); if (h > 0) c.half = h;
      const seed = Number(q.get('seed')); if (seed) c.seed = seed;
      c.ff = Math.max(1, Number(q.get('ff')) || 1);
      if (q.has('autoplay')) { const a = q.get('autoplay'); c.autoplay = a === 'sophie' || a === 'quieto' ? (a as BotKind) : 'nina5'; }
      const cine = q.get('cine'); if (cine === 'full' || cine === 'short' || cine === 'off') c.cine = cine;
      const rv = q.get('rival') as TeamKind | null; if (rv && (SPECIES as string[]).includes(rv)) c.rival = rv;
      const ch = (q.get('chars') ?? '').split(',').filter((x) => (FIELD_CHARS as readonly string[]).includes(x)) as CharId[];
      if (ch.length) c.chars = ch;
      const fs = q.get('forceSpecial'); if (fs) c.forceSpecial = fs;
      const st = q.get('stadium'); if (st === 'volcan' || st === 'bosque' || st === 'arrecife' || st === 'nubes') c.stadium = st;
      const tm = q.get('time'); if (tm === 'day' || tm === 'sunset' || tm === 'night') c.time = tm;
      const cr = q.get('crowd'); if (cr === 'auto' || cr === 'high' || cr === 'low') c.crowd = cr;
      const fc = Number(q.get('fpsCap')); if (fc > 0) c.fpsCap = fc;
      const sq = (q.get('squad') ?? '').split(',').filter(Boolean); if (sq.length) c.squad = cleanSquad(sq);
      this.startMatch(c);
    } else { this.cfg.squad = ['mama', 'sophie', 'alana', 'juandi']; this.cfg.cine = s.cinematics; this.showMenu(q.get('menu') === 'main' ? 'main' : 'title'); }   // in the menu Juandi plays and Papá rests; one tap changes it
  }

  /** Matches that start from the menu show the tour of the controls the first time. */
  private coachNext = false;

  startMatch(cfg0: MatchConfig, fromMenu = false): void {
    this.coachNext = fromMenu;
    const cfg = this.test ? { ...cfg0, ...this.test } : { ...cfg0 };
    const st = this.store.data.settings; cfg.reducedMotion = st.reducedMotion; cfg.narrator = st.narrator && !st.muted; cfg.narratorVolume = st.sfx; cfg.replay = st.replay; cfg.fastForward = cfg.ff > 1;
    const ch = this.store.data.characters;
    cfg.outfits = Object.fromEntries(Object.entries(ch).map(([k, v]) => [k, v.outfit])); cfg.levels = Object.fromEntries(Object.entries(ch).map(([k, v]) => [k, v.level]));
    this.cfg = cfg;
    this.screens.close();
    this.game.scene.stop('Menu');
    document.getElementById('result')?.remove();
    this.kb.mode = cfg.players === 2 ? '2p' : '1p';
    this.kb.active = true;
    this.pad.slots = cfg.players;
    this.touch.configure(cfg.players, cfg.mirror, [cfg.controls[0], cfg.controls[1]]);
    this.touch.show(true);
    this.shell?.setEnabled(true);
    this.router.releaseAll();
    const sc = this.game.scene;
    if (sc.isActive('Match') || sc.isPaused('Match')) sc.stop('Match');
    sc.start('Match', { cfg });
  }

  again(): void { this.startMatch({ ...this.cfg, seed: (this.cfg.seed * 1103515245 + 12345) % 65535 + 1 }); }

  showMenu(first: 'title' | 'main' = 'main'): void {
    this.game.scene.stop('Match');
    document.getElementById('result')?.remove();
    document.getElementById('pause-menu')?.remove();
    this.shell?.setEnabled(false);
    this.touch.show(false);
    this.kb.active = false;
    const k = KINGDOMS[(Date.now() >> 12) % KINGDOMS.length];
    if (!this.game.scene.isActive('Menu')) this.game.scene.start('Menu', { stadium: k.stadium });
    this.screens.show(first, false);
  }

  /** The end of a match: the XP of the family, the Cup and the screen with the result. */
  finish(m: Match): void {
    const cfg = this.cfg, save = this.store.data, live = !cfg.training;
    const res = live ? applyMatch(save, m) : null;
    const cup = live && cfg.cup ? cupMatchResult(save, m) : null;
    const daily = live ? applyDaily(save, m, cfg) : null;
    if (live) this.store.save();
    const a = services.audio; a?.music(null);
    a?.play(cup?.kind === 'champion' ? 'champion' : m.score[0] > m.score[1] || (m.score[0] === m.score[1] && m.penWinner === 0) ? 'win' : m.score[0] === m.score[1] ? 'draw' : 'lose');
    if (cup?.kind === 'champion') { const sc = this.game.scene.getScene('Match') as MatchScene | null; if (sc) sc.ceremony = true; }
    const av = (id: string, scale: number): string => this.screens.avatar(id, scale);
    showResult(m, cfg, res, cup, {
      avatar: av, xpOf: (id) => save.characters[id].xp,
      onAgain: () => this.again(), onMenu: () => this.showMenu(),
      onNext: () => { document.getElementById('result')?.remove(); this.screens.cupMatch(); },
      onCredits: () => { document.getElementById('result')?.remove(); showCredits(() => this.showMenu()); },
    }, daily);
  }

  /** The tour of the first match: the match waits under the cards. */
  coach(sc: MatchScene): void {
    const st = this.store.data.stats, cfg = this.cfg;
    if (!this.coachNext || st.guideSeen || cfg.autoplay || !sc.match.humans.length) return;
    this.coachNext = false;
    sc.setPaused(true); this.router.releaseAll();
    runCoach({ touch: this.touch.coarse, easy: cfg.controls[0] === 'easy' }, () => { st.guideSeen = true; this.store.save(); sc.setPaused(false); });
  }

  credits(): void { showCredits(() => undefined); }

  /** The practice session with Thor (M12). */
  startTraining(players: 1 | 2): void {
    const c = this.cfg;
    this.startMatch({ ...c, players, versus: false, training: true, cup: false, knockout: false, rival: 'tiburon', stadium: 'arrecife', time: 'day', difficulty: 'tranquilos', seed: (Date.now() & 0xffff) + 1, ff: 1, autoplay: null });
  }

  trainingDone(): void {
    this.store.data.stats.trainingDone = true; this.store.save();
    services.audio?.play('win');
    window.setTimeout(() => { if (this.cfg.training && !document.getElementById('result')) showTrainingDone(() => undefined, () => this.showMenu()); }, 1300);
  }

  private persist(): void {
    const s = this.store.data.settings;
    s.controls = [this.cfg.controls[0], this.cfg.controls[1]]; s.difficulty = this.cfg.difficulty; s.halfLength = this.cfg.half as 60 | 90 | 120;
    this.store.save();
  }
}
