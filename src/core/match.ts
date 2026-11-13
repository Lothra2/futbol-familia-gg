import { Rng } from './rng';
import { ARC, DIFFICULTY, MATES, STYLE, T, WEATHER } from './tuning';
import { DT } from './step';
import { newBall, stepBall } from './ball';
import { slotPos, attackDir, ESCAPE, type FormationId } from './field';
import { roster, type FieldChar, type TeamKind } from './teams';
import { emptyInput } from './types';
import { emit, drainEvents } from './events';
import { updatePlayer } from './player';
import { updatePossession } from './possession';
import { movesIn, placeCones, postStep, preStep, setupKickoff, tidyCones } from './rules';
import { dumbThink } from './ai/dumb';
import { aiInput, newMind } from './ai/brain';
import { applyRubber } from './ai/difficulty';
import { updateControl } from './control';
import { stepCharge, stepFlight, superOpen, superShot, trackSuper, trySpecials, updateBar } from './specials';
import { stepPenalties } from './penalties';
import { aiMindsHazards, layoutHazards, stepHazards, type World } from './hazards';
import type { ControlMode, DifficultyId, Match, Player, Strategy, Team, Weather } from './state';

export interface HumanSeat { team: Team; slot: number; humanSlot: number; controls: ControlMode; /** The captain: she never changes player. */ fixed?: boolean }
export interface MatchOptions {
  seed?: number; halfLength?: number; home?: TeamKind; away?: TeamKind; humans?: HumanSeat[];
  ai?: 'dumb' | 'none' | 'brain'; difficulty?: DifficultyId; firstKick?: Team; cine?: 'full' | 'short' | 'off';
  /** The order of the five family field players in the formation (Thor is always the keeper). */
  squad?: FieldChar[];
  /** The formation of each team (Nintendo World Cup): 2-1-2, 1-2-2 or 2-2-1. */
  formation?: [FormationId, FormationId];
  /** The Waiting Room: the weather and how the AI mates of the family play. */
  weather?: Weather; strategy?: Strategy;
  /** The Cup: a tie at the end goes to a golden goal (60 s) and then to penalties. */
  knockout?: boolean;
  /** Practice with Thor: no clock, the rival field players stand still like cones, the special is always ready (src/app/training.ts has the challenges). */
  training?: boolean;
  /** The date of the Cup (0 to 3): the rivals get a little faster and quicker with every kingdom (tuning.ts ARC). */
  arc?: number;
  /** The kingdom whose pitch this is: it brings its traps (hazards.ts). Without it the pitch is clean. */
  world?: World;
  /** Tests: start straight in open play with the ball in the middle. */
  skipKickoff?: boolean;
}

function makePlayer(m: Match, team: Team, seat: ReturnType<typeof roster>[number], human: HumanSeat | undefined): Player {
  const pos = slotPos(team, seat.slot, m.form[team]);
  const control = human ? 'human' : 'ai';
  const diff = DIFFICULTY[m.difficulty];
  // the speed of a rival: the difficulty, the style of his kingdom and the date of the Cup
  const rivalSpeed = diff.speed * (seat.species ? STYLE[seat.species].speed : 1) * (ARC.speed[Math.max(0, Math.min(3, (m.data.arc as number) ?? 0))] ?? 1);
  return {
    id: m.nextId++, team, slot: seat.slot, role: seat.role, stats: seat.stats, charId: seat.charId, species: seat.species, name: seat.stats.name, art: seat.art,
    control, humanSlot: human ? human.humanSlot : null, controls: human ? human.controls : 'full',
    x: pos.x, y: pos.y, z: 0, vx: 0, vy: 0, vz: 0, facing: attackDir(team), dirX: attackDir(team), dirY: 0,
    state: 'idle', stateT: 0, act: null, input: emptyInput(), stamina: T.staminaMax, sprintLock: false, noSprintT: 0,
    speedMult: human ? 1 : team === 1 ? rivalSpeed : MATES.speed, reactionT: 0,
    cd: { slide: 0, steal: 0, bump: 0, jump: 0 }, immuneT: 0, noControlT: 0, dizzyT: 0, shoot: { down: false, t: 0 }, pass: { down: false, t: 0 },
    stats2: { goals: 0, assists: 0, steals: 0, saves: 0, shots: 0, passes: 0, specials: 0, spGoals: 0, chips: 0 }, holdT: 0,
    ai: newMind(), baseSpeed: human ? 1 : team === 1 ? rivalSpeed : MATES.speed,
    aiErr: team === 1 ? diff.shotErr : MATES.shotErr, slideRate: team === 1 ? 0.15 : 0,
  };
}

export function createMatch(o: MatchOptions = {}): Match {
  const m: Match = {
    t: 0, tick: 0, rng: new Rng(o.seed ?? 1), phase: 'kickoff', phaseT: 0, half: 1, clock: 0, halfLength: o.halfLength ?? 90, graceT: 0,
    score: [0, 0], firstKick: o.firstKick ?? 0, restart: null, players: [], ball: newBall(), events: [], nextId: 1,
    ai: o.ai ?? 'brain', difficulty: o.difficulty ?? 'normales', lastPass: null, lastGoal: null,
    humans: [], hin: [null, null], bar: [0, 0], fury: [0, 0], hazards: o.world && !o.training ? layoutHazards(o.world) : [], special: null, flight: null, knockout: o.knockout ?? false, training: o.training ?? false, golden: false, pen: null, penWinner: null, cine: o.cine ?? 'full', specialsUsed: [0, 0],
    stats: { goals: [0, 0], shots: [0, 0], saves: [0, 0], specials: [0, 0] }, form: o.formation ?? ['2-1-2', '2-1-2'], weather: o.weather ?? 'sol', strat: o.strategy ?? { atk: 'mixto', def: 'mixto' }, data: { arc: Math.max(0, Math.min(3, o.arc ?? 0)) },
  };
  for (const [team, kind] of [[0, o.home ?? 'family'], [1, o.away ?? 'dragon']] as [Team, TeamKind][]) {
    for (const seat of roster(kind, o.squad, m.form[team])) m.players.push(makePlayer(m, team, seat, o.humans?.find((h) => h.team === team && h.slot === seat.slot)));
  }
  for (const h of o.humans ?? []) { const pl = m.players.find((q) => q.team === h.team && q.slot === h.slot)!; m.humans.push({ slot: h.humanSlot, team: h.team, id: pl.id, since: 0, controls: h.controls, fixed: !!h.fixed }); }
  for (const p of m.players) p.ai.nextThink = m.rng.range(0, 0.1);
  // the weather lives on the ball: rain makes it roll less, wind pushes it while it flies (its side is drawn once per match)
  if (m.weather === 'lluvia') m.ball.wet = WEATHER.rainRoll;
  if (m.weather === 'viento') m.ball.wind = WEATHER.wind * (m.rng.chance(0.5) ? 1 : -1);
  setupKickoff(m, m.firstKick);
  if (o.training) { placeCones(m); m.halfLength = 1e9; }
  if (o.skipKickoff || o.training) { m.restart = null; m.phase = 'play'; m.ball.state = 'free'; m.events = []; }
  return m;
}

/** Soft separation so players do not stack on the exact same spot. */
function separate(m: Match, dt: number): void {
  const n = m.players.length;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const a = m.players[i], b = m.players[j];
    if (Math.abs(a.z - b.z) > 14) continue;
    const dx = b.x - a.x, dy = b.y - a.y;
    if (Math.abs(dx) < 8 && Math.abs(dy) < 6) { const s = (dy >= 0 ? 1 : -1) * 40 * dt; b.y += s; a.y -= s; }
  }
}

/** One fixed step of the simulation. Inputs for humans are written into player.input by the caller. */
export function step(m: Match, dt: number = DT): void {
  m.tick++; m.t += dt; m.phaseT += dt;
  if (m.phase === 'penalties') { stepPenalties(m, dt); return; }
  updateControl(m);
  preStep(m, dt);
  if (m.phase !== 'over') {
    if (m.ai === 'dumb') for (const p of m.players) { if (p.control === 'ai') p.input = dumbThink(m, p); }
    else if (m.ai === 'brain') for (const p of m.players) { if (p.control === 'ai') { p.input = aiInput(m, p); if (m.hazards.length) aiMindsHazards(m, p, p.input); } }
    if (m.training) for (const p of m.players) if (p.team === 1 && p.role !== 'gk') p.input = emptyInput();
    if (m.tick % 30 === 0) applyRubber(m);
    trySpecials(m);
    // the súper patada: Tiro while the carrier flashes
    const o = m.phase === 'play' ? m.players.find((q) => q.id === m.ball.owner) : undefined;
    if (o && o.input.shootPressed && superOpen(m, o)) superShot(m, o);
    stepCharge(m, dt);
    stepFlight(m, dt);
    const live = movesIn(m);
    stepHazards(m, dt);
    const takerId = m.restart && (m.phase === 'restart' || m.phase === 'kickoff') ? m.restart.taker : -1;
    for (const p of m.players) updatePlayer(m, p, dt, live && p.id !== takerId);
    separate(m, dt);
    // the banana: up or down on the stick of the one who shot bends the ball while it is fresh off the boot
    const bn = m.data.banana as { who: number; slot: number; until: number } | undefined;
    if (bn) {
      const fr = m.hin[bn.slot];
      if (m.t > bn.until || m.ball.state !== 'free' || m.ball.lastTouch.player !== bn.who) m.data.banana = undefined;
      else if (fr && Math.abs(fr.my) > 0.3) m.ball.spin = Math.max(-T.banana.max, Math.min(T.banana.max, m.ball.spin + Math.sign(fr.my) * T.banana.rate * dt));
    }
    const px = m.ball.x, py = m.ball.y;
    stepBall(m.ball, dt, {
      post: (x, y, z, v) => emit(m, 'post', x, y, z, undefined, v),
      bar: (x, y, z, v) => emit(m, 'bar', x, y, z, undefined, v),
      bounce: (x, y, v) => emit(m, 'bounce', x, y, 0, undefined, v),
    });
    updatePossession(m, dt);
    { const o = m.players.find((q) => q.id === m.ball.owner); if (o && m.ball.state === 'owned') trackSuper(m, o, dt); }
    if (m.training) {
      m.bar[0] = T.bar.max;
      tidyCones(m, dt);
      // a cone never keeps the ball: it goes to the closest of the family
      const o = m.players.find((q) => q.id === m.ball.owner);
      if (o && o.team === 1 && o.role !== 'gk') {
        const f = m.players.filter((q) => q.team === 0 && q.role !== 'gk').sort((a, b) => Math.hypot(a.x - o.x, a.y - o.y) - Math.hypot(b.x - o.x, b.y - o.y))[0];
        if (f) { m.ball.owner = f.id; m.ball.state = 'owned'; f.x = Math.max(60, o.x - 40); f.y = o.y; }
      }
    }
    updateBar(m, dt);
    postStep(m, dt, px, py);
  }
  for (const p of m.players) { p.x = Math.max(ESCAPE.x0, Math.min(ESCAPE.x1, p.x)); p.y = Math.max(ESCAPE.y0, Math.min(ESCAPE.y1, p.y)); }
}

export const isOver = (m: Match): boolean => m.phase === 'over';
export { drainEvents };

/** A number that changes if anything observable in the match changes. Same seed and same inputs give the same hash. */
export function hashMatch(m: Match): number {
  let h = 2166136261 >>> 0;
  const mix = (v: number): void => { h = Math.imul(h ^ (Math.round(v * 100) | 0), 16777619) >>> 0; };
  mix(m.t); mix(m.score[0]); mix(m.score[1]); mix(m.clock); mix(m.half); mix(m.ball.x); mix(m.ball.y); mix(m.ball.z); mix(m.ball.vx); mix(m.ball.vy);
  for (const p of m.players) { mix(p.x); mix(p.y); mix(p.stamina); mix(p.stats2.shots); mix(p.stats2.passes); }
  return h;
}
