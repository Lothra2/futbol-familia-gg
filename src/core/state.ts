import type { Rng } from './rng';
import type { FormationId } from './field';
import type { CharId, InputFrame, MatchEvent, Species } from './types';
import type { Cele } from './celebrate';
import type { Hazard } from './hazards';

export type Team = 0 | 1;
export type Role = 'gk' | 'def' | 'mid' | 'fwd';
export type ControlMode = 'easy' | 'full';
export type PState = 'idle' | 'run' | 'sprint' | 'jump' | 'kick' | 'slide' | 'bump' | 'stagger' | 'tumble' | 'dizzy' | 'getup' | 'celebrate' | 'sad' | 'dive' | 'hold' | 'special';
export type KickKind = 'pass' | 'chip' | 'shot' | 'volley' | 'header' | 'chilena' | 'restart' | 'spin';
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
  /** Struck by a player who had already jumped (the view shows the kick of the air). */
  jumped?: boolean;
  /** La palomita: a header thrown flat at a low ball by a player who was running (the diving header of Nintendo World Cup). */
  dive?: boolean;
}
export interface Act {
  kind: 'kick' | 'slide' | 'bump' | 'stagger' | 'tumble' | 'dizzy' | 'getup' | 'steal' | 'dive' | 'hit' | 'taunt';
  /** A fall: somebody has already laughed at him (the bar is charged once per fall). */
  taunted?: boolean;
  /** A hit: a punch or a kick (they take turns). `air`: the flying kick of a player who jumped, it lands on whoever it meets before he comes down. */
  blow?: 'punch' | 'kick'; air?: boolean;
  t: number; dur: number; contact?: number; plan?: KickPlan; done?: boolean; dx?: number; dy?: number; sub?: KickKind;
}

export interface Player {
  id: number; team: Team; slot: number; role: Role; stats: PStats; charId?: CharId; species?: Species; name: string;
  /** The sprite of this player (public/assets/nes/<art>.png). */
  art: string;
  control: 'human' | 'ai'; humanSlot: number | null; controls: ControlMode;
  x: number; y: number; z: number; vx: number; vy: number; vz: number; facing: 1 | -1; dirX: number; dirY: number;
  state: PState; stateT: number; act: Act | null; input: InputFrame;
  stamina: number; sprintLock: boolean; noSprintT: number;
  speedMult: number; reactionT: number;
  cd: { slide: number; steal: number; bump: number; jump: number };
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
  /** The súper patada of Nekketsu: px dribbled without stopping, and until when the flash (the moment to shoot it) lasts. */
  sup?: { run: number; still: number; until: number; last: number } | null;
  /** Hits taken lately (Nekketsu): how many and when the last one was. Three close together knock him out for longer. */
  hits?: { n: number; t: number };
  /** The last blow thrown (punch and kick take turns). */
  blow?: 'punch' | 'kick';
  /** How he strikes the power shot that is flying now, for the view: his flying kick, the spinning kick of a jump, a header, an overhead kick or a volley. */
  supAnim?: 'kick' | 'spin' | 'header' | 'chilena' | 'volley' | 'dive';
  /** The traps of the pitch (hazards.ts): how much the mud slows him this step (1 = not at all) and until when no trap gets him again. */
  mud?: number; hazT?: number;
  /** His part in the celebration of a goal (celebrate.ts). */
  cele?: Cele | null;
  /** What a person has just told this mate of the AI to do (Nintendo World Cup: "pass!", "shoot!", "get him!"). `to`: who asked. */
  order?: { kind: 'pass' | 'shoot' | 'tackle'; to: number; until: number } | null;
}

export interface AIMind {
  nextThink: number; held: InputFrame; armedAt: number; holdLeft: number; holdBtn: 'shoot' | 'pass' | null;
  lastX: number; lastY: number; lastT: number; sidestepUntil: number; sidestepDx: number; sidestepDy: number;
  threat: boolean; rolled: boolean; armedAtThreat: number; diveT: number; specialAt: number; goalDist: number; wasWanting: boolean; thinkT: number; pathLen: number;
  /** The keeper: when he may go out at the feet of a carrier again, whether he goes at this carrier, and whether he goes for this high ball (each decided once). */
  rushCd?: number; rushOn?: { id: number; t: number; go: boolean }; claimOn?: { t: number; go: boolean };
  /** The puddle he is coming to, and whether he remembered to stop sprinting before it (hazards.ts). */
  puddle?: { i: number; t: number; careful: boolean };
  /** A run into space behind the last defender (mejora 2): until when, and where to. */
  runUntil?: number; runX?: number; runY?: number;
}
export interface HumanCtl { slot: number; team: Team; id: number; since: number; controls: ControlMode; /** The captain of Nekketsu: she always moves the same player and orders the others about (control.ts). */ fixed?: boolean; /** How long Pass has been held and whether it was down in the last step (control.ts: a short tap switches player). */ passT?: number; passWas?: boolean }
export type SpecialKind = 'arcoiris' | 'burbuja' | 'canonazo' | 'estrellas' | 'carrera' | 'relampago' | 'llamarada' | 'ola' | 'picada' | 'hojas';
/** A special that is being loaded (specials.ts): the shooter winds up for `dur` s with a little bar over his head while the match goes on,
 *  and then the ball flies. `outcome` is rolled when the bar is let go. */
export interface SpecialState { kind: SpecialKind; team: Team; shooter: number; keeper: number | null; outcome: 'goal' | 'save'; t: number; dur: number; x: number; y: number;
  charge: SpecialCharge }
/** The bar of the charge. `slot`: the person who lets it go by pressing Tiro or Especial again (null: nobody, it goes off by itself at the end).
 *  `hit`: where it was let go (in the yellow, in the green, too soon, or never). `p`: the chance of a goal before the bonus of the press. */
/** `slot`: the person who lets the bar go (null: nobody, it goes off by itself). `def`: the bar is of a rival and the person is the one who
 *  defends: pressing in time helps the keeper instead. */
export interface SpecialCharge { slot: number | null; def: boolean; hit: 'perfect' | 'good' | 'early' | 'none' | null; p: number; easy: boolean; good: [number, number]; perfect: [number, number] }

/** The scripted flight of a special once it is let go: the ball follows a path chosen by the kind and the result is already decided. */
export interface Flight {
  kind: SpecialKind; team: Team; shooter: number; keeper: number | null; outcome: 'goal' | 'save'; t: number; dur: number;
  x0: number; y0: number; x1: number; y1: number; dived: boolean; targets: number[]; hit: number[];
  /** Px above the ground the ball was struck at (a header, a kick in the air): it comes down from there in the first third of the flight. */
  z0?: number;
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
  /** The weather on the ball (Nintendo World Cup): `wet` multiplies the rolling friction (rain), `wind` pushes a ball in the air along x (px/s²). */
  wet?: number; wind?: number;
  /** The kick that sent it flying, for the view (the ball of a spinning kick does not look like the ball of a pass): what and when. */
  kick?: { kind: string; t: number };
}

export type Phase = 'kickoff' | 'play' | 'restart' | 'goal' | 'halftime' | 'penalties' | 'over';
export type RestartKind = 'kickoff' | 'throwin' | 'goalkick' | 'corner';
/** The aim of a free kick: where in the goal (y), how much effect (0 flat to 1 full, the bend goes around the wall), the players of the wall and the one who was fouled. */
export interface Restart { kind: RestartKind; team: Team; x: number; y: number; taker: number; t: number; kicked: boolean; aiAt: number }

/** The weather of the Waiting Room. */
export type Weather = 'sol' | 'lluvia' | 'viento';
/** The strategy of the Waiting Room for the AI mates of the family: how they attack (pass, mixed, dribble) and defend (mark, mixed, tackle). */
export interface Strategy { atk: 'pase' | 'mixto' | 'gambeta'; def: 'marcar' | 'mixto' | 'barrer' }

export interface Match {
  t: number; tick: number; rng: Rng;
  phase: Phase; phaseT: number; half: 1 | 2; clock: number; halfLength: number; graceT: number;
  score: [number, number]; firstKick: Team; restart: Restart | null;
  players: Player[]; ball: Ball; events: MatchEvent[]; nextId: number;
  ai: 'dumb' | 'none' | 'brain'; difficulty: DifficultyId;
  humans: HumanCtl[]; hin: (InputFrame | null)[];
  bar: [number, number]; special: SpecialState | null; flight: Flight | null;
  /** The traps that lie on this pitch (hazards.ts). None in a practice, or when they are turned off. */
  hazards: Hazard[];
  /** Sangre caliente: until when (match time) each team burns. */
  fury: [number, number];
  /** A knockout match (the Cup): a tie goes to a golden goal and then to penalties. */
  knockout: boolean; training: boolean; golden: boolean; pen: Pen | null; penWinner: Team | null; cine: 'full' | 'short' | 'off'; specialsUsed: [number, number];
  lastPass: { from: number; to: number; t: number; team: Team; done?: boolean } | null;
  lastGoal: { team: Team; scorer: number | null; assist: number | null } | null;
  stats: { goals: [number, number]; shots: [number, number]; saves: [number, number]; specials: [number, number] };
  /** The formation of each team. */
  form: [FormationId, FormationId];
  /** The Waiting Room: the weather and the strategy of the family mates. */
  weather: Weather; strat: Strategy;
  data: Record<string, any>;
}
