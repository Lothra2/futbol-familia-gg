import { createMatch, drainEvents, step, type HumanSeat } from '../core/match';
import { setHumanInput } from '../core/control';
import { launchSpecial } from '../core/specials';
import { attackDir } from '../core/field';
import { StepClock } from '../core/step';
import { botFrame, newBot, type BotKind } from '../core/ai/testbots';
import type { InputRouter } from '../input/router';
import type { CharId, MatchEvent } from '../core/types';
import type { ControlMode, DifficultyId, Match } from '../core/state';
import { DEFAULT_SQUAD, FIELD_CHARS, squadSeats, type FieldChar, type TeamKind } from '../core/teams';

export interface MatchConfig {
  players: 1 | 2;
  controls: ControlMode[];
  chars: CharId[];
  /** The four family field players that start (the fifth rests). */
  squad: FieldChar[];
  difficulty: DifficultyId;
  half: 60 | 90 | 120 | number;
  seed: number;
  rival: TeamKind;
  autoplay: BotKind | null;
  ff: number;
  cine: 'full' | 'short' | 'off';
  mirror: boolean;
  /** A Cup match: no draws (golden goal, then penalties) and the result moves the Cup forward. */
  cup?: boolean; knockout?: boolean; training?: boolean;
  /** Two players against each other: player 2 plays the rival team. */
  versus?: boolean;
  /** From the settings: no freeze frames. */
  reducedMotion?: boolean;
  /** From the settings: the voice of the match. */
  narrator?: boolean; narratorVolume?: number; replay?: boolean;
  /** Tests: fast forward runs without freezes. */
  fastForward?: boolean;
  /** From the save: the outfit and the level of each family character (the outfit is a different atlas, the level opens the golden celebration and trail). */
  outfits?: Partial<Record<CharId, string>>; levels?: Partial<Record<CharId, number>>;
  /** Tests only: who throws a special as soon as the match is live (a character id, or a species for the rivals). */
  forceSpecial?: string;
  /** Stadium look: which one, the hour of the day, the quality of the crowd and (tests) a frame rate that fakes slow frames. */
  stadium?: 'volcan' | 'bosque' | 'arrecife' | 'nubes'; time?: 'day' | 'sunset' | 'night'; crowd?: 'auto' | 'high' | 'low'; fpsCap?: number;
}
export const defaultConfig = (): MatchConfig => ({
  players: 1, controls: ['full', 'full'], chars: ['sophie', 'alana'], squad: [...DEFAULT_SQUAD], difficulty: 'normales', half: 90, seed: (Date.now() & 0xffff) + 1,
  rival: 'dragon', autoplay: null, ff: 1, cine: 'off', mirror: false,
});

/** The squad as it will be used: four different field characters, the default one if the list is not valid. */
export const cleanSquad = (s: readonly string[] | undefined): FieldChar[] => {
  const u = [...new Set((s ?? []).filter((c): c is FieldChar => (FIELD_CHARS as readonly string[]).includes(c)))];
  return u.length === 4 ? u : [...DEFAULT_SQUAD];
};

/** Owns one match: builds it from the menu choices, feeds it the human input (or a test bot) at the fixed step and hands back the events. */
export class MatchController {
  readonly m: Match;
  private clock = new StepClock();
  private bots: ReturnType<typeof newBot>[] = [];

  constructor(readonly cfg: MatchConfig, private router: InputRouter | null) {
    const humans: HumanSeat[] = [];
    const squad = cleanSquad(cfg.squad), seats = squadSeats(squad);
    for (let i = 0; i < cfg.players; i++) {
      if (cfg.versus && i === 1) { humans.push({ team: 1, slot: 3, humanSlot: 1, controls: cfg.controls[1] ?? 'full' }); continue; }
      // the wanted character if it plays, else the first of the squad not taken yet (Sophie and Alana first)
      const wanted = cfg.chars[i] ?? (i === 0 ? 'sophie' : 'alana');
      const free = (['sophie', 'alana', 'juandi', 'mama', 'papa'] as FieldChar[]).filter((c) => squad.includes(c) && !humans.some((h) => h.slot === seats[c]));
      const c = (squad as string[]).includes(wanted) && !humans.some((h) => h.slot === seats[wanted as FieldChar]) ? (wanted as FieldChar) : free[0];
      humans.push({ team: 0, slot: seats[c]!, humanSlot: i, controls: cfg.controls[i] ?? 'full' });
    }
    this.m = createMatch({ seed: cfg.seed, halfLength: cfg.half, humans, squad, ai: 'brain', difficulty: cfg.difficulty, away: cfg.rival, cine: cfg.cine, knockout: cfg.knockout, training: cfg.training });
    if (cfg.autoplay) this.bots = humans.map(() => newBot(cfg.autoplay!));
    if (cfg.forceSpecial) this.force(cfg.forceSpecial);
  }

  /** Test hook: puts the chosen player in front of the rival goal with the ball and a full bar, and launches the special. */
  private force(who: string): void {
    const m = this.m;
    const p = m.players.find((q) => q.charId === who || q.species === who && q.role !== 'gk');
    if (!p) return;
    m.restart = null; m.phase = 'play'; m.phaseT = 0; m.events = [];
    const dir = attackDir(p.team), b = m.ball;
    if (p.role === 'gk') { p.x = 14; p.y = 80; b.state = 'held'; b.owner = p.id; p.state = 'hold'; }
    else { p.x = p.team === 0 ? 640 : 320; p.y = 80; b.state = 'owned'; b.owner = p.id; b.x = p.x + dir * 8; b.y = p.y; }
    m.bar[p.team] = 100;
    launchSpecial(m, p);
  }

  /** Runs the steps that `seconds` of real time are worth. Returns the events of those steps, in order. */
  advance(seconds: number, ff = 1): MatchEvent[] {
    const out: MatchEvent[] = [];
    const n = this.clock.steps(seconds, ff);
    for (let i = 0; i < n && this.m.phase !== 'over'; i++) {
      for (const h of this.m.humans) {
        const f = this.bots.length ? botFrame(this.m, h, this.bots[h.slot]) : this.router ? this.router.frame(h.slot) : null;
        setHumanInput(this.m, h.slot, f);
      }
      step(this.m);
      this.router?.endStep();
      for (const e of drainEvents(this.m)) out.push(e);
    }
    return out;
  }
  resetClock(): void { this.clock.reset(); }
}
