import type { Rng } from './rng';
import type { CharId, InputFrame, MatchEvent, Species } from './types';

export type Team = 0 | 1;
export type Role = 'gk' | 'def' | 'fwd';
export type ControlMode = 'easy' | 'full';
export type PState = 'idle' | 'run' | 'sprint' | 'kick' | 'slide' | 'bump' | 'stagger' | 'tumble' | 'dizzy' | 'getup' | 'celebrate' | 'sad' | 'dive' | 'hold' | 'special';
export type KickKind = 'pass' | 'chip' | 'shot' | 'volley' | 'header' | 'chilena' | 'restart';
export type DifficultyId = 'tranquilos' | 'normales' | 'campeones';

export interface PStats {
  name: string; run: number; sprint: number; stamina: number; power: number; passAcc: number; control: number; resist: number; stolen: number;
  keeper?: { reaction: number; reach: number; skill: number };
  /** Multiplies the chance of a front steal by this player (the style of a species, tuning.ts STYLE). */
  steal?: number;
}

/** What a kick will do. Planned when the button is pressed or released, resolved at the moment of contact from the ball's real position. */
export interface KickPlan {
  kind: KickKind; speed: number; vz: number; tx: number; ty: number; err: number; spin: number;
  lob?: boolean; assist?: boolean; target?: number; air?: boolean; hard?: number; throwFrom?: boolean;
  /** A shot or pass taken first time (the button was pressed before the ball arrived), and a chip over a keeper who is off his line. */
  first?: boolean; vaselina?: boolean;
}
export interface Act {
  kind: 'kick' | 'slide' | 'bump' | 'stagger' | 'tumble' | 'dizzy' | 'getup' | 'steal' | 'dive';
  t: number; dur: number; contact?: number; plan?: KickPlan; done?: boolean; dx?: number; dy?: number; sub?: KickKind;
}

export interface Player {
  id: number; team: Team; slot: number; role: Role; stats: PStats; charId?: CharId; species?: Species; name: string;
  control: 'human' | 'ai'; humanSlot: number | null; controls: ControlMode;
  x: number; y: number; z: number; vx: number; vy: number; vz: number; facing: 1 | -1; dirX: number; dirY: number;
  state: PState; stateT: number; act: Act | null; input: InputFrame;
  stamina: number; sprintLock: boolean; noSprintT: number;
  speedMult: number; reactionT: number;
  cd: { slide: number; steal: number; bump: number };
  immuneT: number; noControlT: number; dizzyT: number;
  shoot: { down: boolean; t: number }; pass: { down: boolean; t: number };
  stats2: { goals: number; assists: number; steals: number; saves: number; shots: number; passes: number; specials: number; spGoals: number; chips: number };
  holdT: number;   // time the owner has kept the ball (keepers release it after a while)
  /** AI personality and memory (see ai/brain.ts). Humans do not use it. */
  ai: AIMind;
  baseSpeed: number; aiErr: number; slideRate: number;
  /** Seconds the stick has been pushed past 85 % (easy controls sprint by themselves after 0.3 s). */
  autoT?: number;
  /** How long a human has been containing (holding Pass without the ball) and how long the carrier stays slowed by it. */
  containT?: number; slowT?: number;
  /** A button pressed a moment before the ball reaches him, kept until it does (first time shots and passes). */
  buf?: { kind: 'shoot' | 'pass'; until: number } | null;
}

export interface AIMind {
  nextThink: number; held: InputFrame; armedAt: number; holdLeft: number; holdBtn: 'shoot' | 'pass' | null;
  lastX: number; lastY: number; lastT: number; sidestepUntil: number; sidestepDx: number; sidestepDy: number;
  threat: boolean; rolled: boolean; armedAtThreat: number; diveT: number; specialAt: number; goalDist: number; wasWanting: boolean; thinkT: number; pathLen: number;
  /** A run into space behind the last defender (mejora 2): until when, and where to. */
  runUntil?: number; runX?: number; runY?: number;
}
export interface HumanCtl { slot: number; team: Team; id: number; since: number; controls: ControlMode; /** How long Pass has been held and whether it was down in the last step (control.ts: a short tap switches player). */ passT?: number; passWas?: boolean }
export type SpecialKind = 'arcoiris' | 'burbuja' | 'canonazo' | 'estrellas' | 'carrera' | 'relampago' | 'llamarada' | 'ola' | 'picada' | 'hojas';
export interface SpecialState { kind: SpecialKind; team: Team; shooter: number; keeper: number | null; outcome: 'goal' | 'save'; t: number; dur: number; x: number; y: number; full: boolean;
  /** The AHORA ring (mejora 4): a person presses Tiro or Especial when it closes. `atk` is the shooter, `def` the one who defends against a special of the AI. The result is rolled when it ends. */
  ring?: SpecialRing }
export interface SpecialRing { who: 'atk' | 'def'; slot: number; center: number; good: number; perfect: number; end: number; press: number | null; hit: 'perfect' | 'good' | 'miss' | null; p: number; easy: boolean }

/** The scripted flight of a special after its cinematic: the ball follows a path chosen by the kind and the result is already decided. */
export interface Flight {
  kind: SpecialKind; team: Team; shooter: number; keeper: number | null; outcome: 'goal' | 'save'; t: number; dur: number;
  x0: number; y0: number; x1: number; y1: number; dived: boolean; targets: number[]; hit: number[];
}
/** The state of a penalty shootout (GAME_DESIGN section 11): who kicks, the step of the kick and the result already rolled. */
export interface Pen {
  turn: Team; first: Team; kicks: [(0 | 1)[], (0 | 1)[]]; round: number; step: 'ready' | 'aim' | 'fly' | 'result'; t: number; aimY: number;
  /** Height of the aim, 0 the grass and 1 the crossbar, and the height the shot really got. `decisive`: this kick wins it if it goes in ('win') or loses it if it fails ('last'). */
  aimZ: number; shotZ: number; decisive: 'win' | 'last' | null; aiZ?: number; aim: { zone: number; y: number };
  /** Practice with Thor: only the family kicks, kick after kick, nobody wins (the goals are counted in `m.data.penGoals`). */ practice?: boolean;
  shooter: number; keeper: number; outcome: 'goal' | 'saved' | 'miss' | 'post' | null; shotY: number; diveY: number; winner: Team | null; seed: number; aiAt?: number; aiY?: number;
}
export type BallState = 'owned' | 'free' | 'held' | 'dead' | 'scripted';
export interface Ball {
  x: number; y: number; z: number; vx: number; vy: number; vz: number; spin: number; roll: number;
  state: BallState; owner: number | null;
  lastTouch: { team: Team | null; player: number | null; t: number };
  prevTouch: { team: Team | null; player: number | null; t: number };
  inNet: boolean; scored: Team | null;
}

export type Phase = 'kickoff' | 'play' | 'restart' | 'goal' | 'halftime' | 'cinematic' | 'penalties' | 'over';
export type RestartKind = 'kickoff' | 'throwin' | 'goalkick' | 'corner' | 'freekick';
/** The aim of a free kick: where in the goal (y), how much effect (0 flat to 1 full, the bend goes around the wall), the players of the wall and the one who was fouled. */
export interface FreeKick { aimY: number; curve: number; wall: number[]; fouled: number }
export interface Restart { kind: RestartKind; team: Team; x: number; y: number; taker: number; t: number; kicked: boolean; aiAt: number; fk?: FreeKick }

export interface Match {
  t: number; tick: number; rng: Rng;
  phase: Phase; phaseT: number; half: 1 | 2; clock: number; halfLength: number; graceT: number;
  score: [number, number]; firstKick: Team; restart: Restart | null;
  players: Player[]; ball: Ball; events: MatchEvent[]; nextId: number;
  ai: 'dumb' | 'none' | 'brain'; difficulty: DifficultyId;
  humans: HumanCtl[]; hin: (InputFrame | null)[];
  bar: [number, number]; special: SpecialState | null; flight: Flight | null;
  /** A knockout match (the Cup): a tie goes to a golden goal and then to penalties. */
  knockout: boolean; training: boolean; golden: boolean; pen: Pen | null; penWinner: Team | null; cine: 'full' | 'short' | 'off'; specialsUsed: [number, number];
  lastPass: { from: number; to: number; t: number; team: Team; done?: boolean } | null;
  lastGoal: { team: Team; scorer: number | null; assist: number | null } | null;
  stats: { goals: [number, number]; shots: [number, number]; saves: [number, number]; specials: [number, number] };
  data: Record<string, any>;
}
