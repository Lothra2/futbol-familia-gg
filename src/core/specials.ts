import { DIFFICULTY, SPECIAL_BASE, T } from './tuning';
import { PITCH, attackDir, goalX, ownGoalX, slotPos } from './field';
import { emit } from './events';
import { playerById, setTouch, startDive, startStagger, startTumble } from './actions';
import type { Flight, Match, Player, SpecialKind, Team } from './state';

const KIND_FAMILY: Record<string, SpecialKind> = { sophie: 'arcoiris', alana: 'burbuja', papa: 'canonazo', mama: 'estrellas', juandi: 'relampago', thor: 'carrera' };
const KIND_SPECIES: Record<string, SpecialKind> = { dragon: 'llamarada', tiburon: 'ola', buho: 'picada', mapache: 'hojas' };
export const KIND_INDEX: SpecialKind[] = ['arcoiris', 'burbuja', 'canonazo', 'estrellas', 'carrera', 'llamarada', 'ola', 'picada', 'hojas', 'relampago'];
export const specialKind = (p: Player): SpecialKind => (p.charId ? KIND_FAMILY[p.charId] : KIND_SPECIES[p.species!]);

// ------------------------------------------------------------------------------------------------ Barra Estrella
const easyHuman = (m: Match, team: Team): boolean => m.players.some((p) => p.team === team && p.control === 'human' && p.controls === 'easy');
const humanTeam = (m: Match, team: Team): boolean => m.players.some((p) => p.team === team && p.control === 'human');
export const barMult = (m: Match, team: Team): number => (team === 0 ? (easyHuman(m, 0) ? T.bar.easyMult : 1) : humanTeam(m, 1) ? 1 : DIFFICULTY[m.difficulty].star);

export function addBar(m: Match, team: Team, amount: number): void {
  const before = m.bar[team];
  m.bar[team] = Math.min(T.bar.max, before + amount * barMult(m, team));
  if (before < T.bar.max && m.bar[team] >= T.bar.max) {
    const full = (m.data.fullAt ??= [0, 0]) as number[];
    full[team] = m.t;
    emit(m, 'starfull', m.ball.x, m.ball.y, 0, undefined, team);
  }
}
/** Slow charge while the ball is in the half the team attacks. */
export function updateBar(m: Match, dt: number): void {
  if (m.phase !== 'play') return;
  const inHalf0 = m.ball.x > PITCH.w / 2;
  addBar(m, inHalf0 ? 0 : 1, T.bar.half * dt);
}

// ------------------------------------------------------------------------------------------------ launching
/** Chance that the special is a goal (GAME_DESIGN section 7). */
export function specialChance(m: Match, shooter: Player, from: { x: number }): number {
  const kind = specialKind(shooter);
  let p = shooter.team === 1 && !humanTeam(m, 1) ? DIFFICULTY[m.difficulty].special : kind in SPECIAL_BASE ? SPECIAL_BASE[kind as keyof typeof SPECIAL_BASE] : 0.7;
  if (Math.abs(goalX(shooter.team) - from.x) > PITCH.w / 2 && kind !== 'arcoiris') p *= T.special.own;
  if (shooter.team === 0 || humanTeam(m, 1)) p *= T.special.keeperMult[m.difficulty];
  if (shooter.control === 'human' && shooter.controls === 'easy') p += T.special.ayuda;
  return Math.min(T.special.cap, p);
}

/** Who may throw the special this step, if anybody. 'far' means the button was pressed too far from the goal (the bar is not spent). */
export function trySpecials(m: Match): void {
  if (m.phase !== 'play') return;
  const b = m.ball;
  for (const p of m.players) {
    if (!p.input.specialPressed) continue;
    if (m.bar[p.team] < T.bar.max) continue;
    const humans = m.players.some((q) => q.team === p.team && q.control === 'human');
    if (p.control === 'ai' && humans) continue;   // the AI mates of a team with a human never spend the bar he is saving
    let shooter: Player | null = null;
    if (b.owner === p.id && b.state === 'owned' && p.role !== 'gk') shooter = p;
    else if (p.team === 0) {
      const gk = m.players.find((q) => q.team === 0 && q.role === 'gk');
      if (gk && b.state === 'held' && b.owner === gk.id) shooter = gk;
    }
    if (!shooter) continue;
    if (specialKind(shooter) !== 'arcoiris' && shooter.role !== 'gk' && Math.abs(goalX(shooter.team) - shooter.x) > PITCH.w * T.special.zone) { emit(m, 'special_far', shooter.x, shooter.y, 0, shooter.id); continue; }
    launchSpecial(m, shooter);
    return;
  }
}

export function launchSpecial(m: Match, s: Player): void {
  const b = m.ball, team = s.team;
  const keeper = m.players.find((q) => q.team !== team && q.role === 'gk') ?? null;
  const first = m.specialsUsed[team] === 0;
  const dur = m.cine === 'off' ? T.cinemaT.off : m.cine === 'short' ? T.cinemaT.short : first ? T.cinemaT.full : T.cinemaT.short;
  const kind = specialKind(s), outcome = m.rng.chance(specialChance(m, s, s)) ? 'goal' : 'save';
  m.special = { kind, team, shooter: s.id, keeper: keeper ? keeper.id : null, outcome, t: 0, dur, x: s.x, y: s.y, full: dur >= T.cinemaT.full };
  m.phase = 'cinematic'; m.phaseT = 0;
  m.bar[team] = 0; m.specialsUsed[team]++; m.stats.specials[team]++; s.stats2.specials++;
  if (b.state === 'owned') { b.state = 'scripted'; }
  b.owner = b.state === 'held' ? b.owner : null;
  s.state = 'special'; s.act = null; s.vx = s.vy = 0;
  setTouch(m, s);
  emit(m, 'special', s.x, s.y, 0, s.id, KIND_INDEX.indexOf(kind));
}

/** Runs the fixed-length cinematic. Nothing moves in the match. Any button after 0.3 s skips it. */
export function stepCinematic(m: Match, dt: number): void {
  const sp = m.special;
  if (!sp) { m.phase = 'play'; return; }
  sp.t += dt;
  const skip = sp.t >= T.special.skipAfter && m.hin.some((f) => !!f && (f.shootPressed || f.passPressed || f.specialPressed));
  if (sp.t >= sp.dur || skip) resolveSpecial(m);
}

/** The cinematic is over: the ball starts its scripted flight (the result was rolled at launch) and the match is live again. */
function resolveSpecial(m: Match): void {
  const sp = m.special!, s = playerById(m, sp.shooter)!, b = m.ball, team = sp.team, dir = attackDir(team), gx = goalX(team);
  const foes = m.players.filter((q) => q.team !== team && q.role !== 'gk');
  const x0 = s.x + dir * 8, y0 = s.y;
  const goal = sp.outcome === 'goal';
  const x1 = goal ? gx + dir * 8 : gx - dir * (T.gk.rebound + m.rng.range(0, 14));
  const y1 = goal ? 80 + m.rng.range(-18, 18) : 80 + m.rng.range(-30, 30);
  const dist = Math.hypot(x1 - x0, y1 - y0);
  const targets = sp.kind === 'estrellas' ? [...foes].filter((o) => (o.x - s.x) * dir > -40).sort((a, c) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(c.x - s.x, c.y - s.y)).slice(0, 3).map((o) => o.id) : [];
  m.flight = { kind: sp.kind, team, shooter: s.id, keeper: sp.keeper, outcome: sp.outcome, t: 0, dur: flightDur(sp.kind, dist), x0, y0, x1, y1, dived: false, targets, hit: [] };
  m.special = null; m.phase = 'play'; m.phaseT = 0;
  Object.assign(b, { x: x0, y: y0, z: 4, vx: 0, vy: 0, vz: 0, spin: 0, owner: null, state: 'scripted', inNet: false, scored: null });
  setTouch(m, s);
}

const clamp = (v: number, a: number, c: number): number => Math.max(a, Math.min(c, v));
/** How long each special flies (s). The bubble goes at about 160 px/s, the cannon at 600 px/s (GAME_DESIGN section 7). */
export function flightDur(kind: SpecialKind, dist: number): number {
  switch (kind) {
    case 'arcoiris': return 1.1; case 'burbuja': return clamp(dist / 160, 1.0, 2.2); case 'canonazo': return Math.max(0.4, dist / 600);
    case 'estrellas': return 1.4; case 'carrera': return Math.max(0.8, dist / 600); case 'relampago': return 0.9;
    case 'llamarada': return 1.1; case 'ola': return 1.4; case 'picada': return 1.6; default: return 1.4;
  }
}

/** Where the ball is at u (0 to 1) of its flight. It always lands where the result says (x1, y1) at ground level. */
export function flightPos(f: Flight, u: number): { x: number; y: number; z: number } {
  const e = u, base = { x: f.x0 + (f.x1 - f.x0) * e, y: f.y0 + (f.y1 - f.y0) * e };
  const side = f.y1 >= f.y0 ? 1 : -1, fade = 1 - u, s = Math.sin(Math.PI * u);
  switch (f.kind) {
    case 'arcoiris': return { x: base.x, y: base.y + side * 46 * s, z: 6 + 62 * s };
    case 'burbuja': return { x: base.x, y: base.y + 9 * Math.sin(u * Math.PI * 6) * fade, z: 14 + 6 * Math.sin(u * Math.PI * 5) };
    case 'canonazo': return { x: base.x, y: base.y, z: 8 + 4 * s };
    case 'estrellas': return { x: base.x, y: base.y + 32 * Math.sin(u * Math.PI * 3) * fade, z: 10 + 6 * s };
    case 'carrera': return { x: base.x, y: base.y, z: 2 };
    case 'relampago': { const zig = (2 / Math.PI) * Math.asin(Math.sin(u * Math.PI * 4)); return { x: base.x, y: base.y + 38 * zig * fade, z: 8 + 4 * s }; }
    case 'llamarada': { const v = Math.pow(u, 0.6); return { x: base.x, y: base.y, z: 6 + 104 * Math.sin(Math.PI * v) }; }
    case 'ola': return { x: base.x, y: base.y + 14 * Math.sin(u * Math.PI * 4), z: 3 };
    case 'picada': return { x: base.x, y: base.y, z: 6 + 420 * Math.max(0, 1 - Math.pow(2 * u - 1, 2)) };
    default: return { x: base.x, y: base.y + 26 * Math.sin(u * Math.PI * 4) * fade, z: 8 };   // hojas
  }
}

/** Runs the flight: the ball and Thor (for the Carrera Loca) follow the path, the keeper stretches, rivals in the way fall, and at the end the result lands. */
export function stepFlight(m: Match, dt: number): void {
  const f = m.flight;
  if (!f) return;
  const s = playerById(m, f.shooter)!, b = m.ball, dir = attackDir(f.team);
  if (m.phase !== 'play') { m.flight = null; if (s.state === 'special') s.state = 'idle'; return; }
  f.t += dt;
  const u = Math.min(1, f.t / f.dur), p = flightPos(f, u);
  b.x = p.x; b.y = p.y; b.z = p.z; b.vx = b.vy = b.vz = 0; b.state = 'scripted'; b.owner = null;
  if (f.kind === 'carrera') { s.x = p.x; s.y = p.y; s.facing = dir; s.dirX = dir; }
  emit(m, 'trail', p.x, p.y, p.z, f.shooter, KIND_INDEX.indexOf(f.kind));
  const keeper = playerById(m, f.keeper);
  if (keeper && !f.dived && f.dur - f.t < T.gk.diveT * 0.8) {
    f.dived = true;
    startDive(m, keeper, f.outcome === 'save' ? f.y1 : f.y1 + (f.y1 > 80 ? -44 : 44));   // a goal means he guessed the wrong side
  }
  const foes = m.players.filter((q) => q.team !== f.team && q.role !== 'gk');
  if (f.kind === 'canonazo') for (const o of foes) if (!f.hit.includes(o.id) && (b.x - o.x) * dir >= -4 && Math.abs(o.y - b.y) < 16) { f.hit.push(o.id); startTumble(m, o, 0.5); }
  if (f.kind === 'estrellas') for (const id of f.targets) { const o = playerById(m, id)!; if (!f.hit.includes(id) && (b.x - o.x) * dir >= -4) { f.hit.push(id); startStagger(m, o, 0.6); } }
  if (u >= 1) endFlight(m, f, s);
}

function endFlight(m: Match, f: Flight, s: Player): void {
  const b = m.ball, dir = attackDir(f.team), keeper = playerById(m, f.keeper);
  m.flight = null;
  s.state = 'idle'; s.immuneT = 0;
  if (f.kind === 'carrera') { const home = slotPos(f.team, s.slot); emit(m, 'zas', s.x, s.y, 0, s.id); s.x = home.x; s.y = home.y; }
  b.owner = null; b.state = 'free'; b.vx = b.vy = b.vz = 0; b.spin = 0; b.z = 0;
  setTouch(m, s);
  if (f.outcome === 'goal') {
    b.x = f.x1; b.y = f.y1; b.z = 6; b.inNet = true; b.scored = f.team; s.stats2.spGoals++;
    if (keeper && f.kind === 'canonazo') startTumble(m, keeper, 0.7);
  } else {
    const inward = -dir as 1 | -1;
    b.x = f.x1; b.y = f.y1; b.vx = inward * 60; b.vy = m.rng.range(-40, 40); b.vz = 80; b.inNet = false;
    if (keeper) { keeper.noControlT = 0.3; keeper.stats2.saves++; m.stats.saves[keeper.team]++; startStagger(m, keeper, 0.3); emit(m, 'save', b.x, b.y, 0, keeper.id, 2); }
    b.lastTouch = { team: keeper ? keeper.team : null, player: keeper ? keeper.id : null, t: m.t };
  }
}
void ownGoalX;
