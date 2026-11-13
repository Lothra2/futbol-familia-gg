import { DIFFICULTY, SPECIAL_BASE, STYLE, T } from './tuning';
import { MID, PITCH, attackDir, goalX, ownGoalX, slotPos } from './field';
import { emit } from './events';
import { holdBall, knockDown, playerById, setTouch, startDive, startGetup, startStagger, startTumble } from './actions';
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
  let p = shooter.team === 1 && !humanTeam(m, 1) ? DIFFICULTY[m.difficulty].special * (shooter.species ? STYLE[shooter.species].special : 1) : kind in SPECIAL_BASE ? SPECIAL_BASE[kind as keyof typeof SPECIAL_BASE] : 0.7;
  if (Math.abs(goalX(shooter.team) - from.x) > PITCH.w / 2 && kind !== 'arcoiris') p *= T.special.own;
  if (shooter.team === 0 || humanTeam(m, 1)) p *= T.special.keeperMult[m.difficulty];
  if (shooter.control === 'human' && shooter.controls === 'easy') p += T.special.ayuda;
  return Math.min(T.special.cap, p);
}

/** Who may throw the special this step, if anybody. 'far' means the button was pressed too far from the goal (the bar is not spent). */
export function trySpecials(m: Match): void {
  if (m.phase !== 'play' || m.special) return;
  const b = m.ball;
  for (const p of m.players) {
    if (!p.input.specialPressed) continue;
    if (m.bar[p.team] < T.bar.max) continue;
    const humans = m.players.some((q) => q.team === p.team && q.control === 'human');
    if (p.control === 'ai' && humans) continue;   // the AI mates of a team with a human never spend the bar he is saving
    let shooter: Player | null = null;
    if (b.owner === p.id && b.state === 'owned' && p.role !== 'gk') shooter = p;
    // the captain orders the special of the mate who carries the ball (the bar is the team's)
    else if (p.control === 'human' && b.state === 'owned') { const o = m.players.find((q) => q.id === b.owner); if (o && o.team === p.team && o.control === 'ai' && o.role !== 'gk') shooter = o; }
    else if (p.team === 0) {
      const gk = m.players.find((q) => q.team === 0 && q.role === 'gk');
      if (gk && b.state === 'held' && b.owner === gk.id) shooter = gk;
    }
    if (!shooter) continue;
    if (specialKind(shooter) !== 'arcoiris' && shooter.role !== 'gk' && Math.abs(goalX(shooter.team) - shooter.x) > PITCH.w * T.special.zone) { emit(m, 'special_far', shooter.x, shooter.y, 0, shooter.id); continue; }
    launchSpecial(m, shooter, p.control === 'human' ? p : null);
    return;
  }
}

/** The special starts: no film, the match goes on. The shooter winds up with a little bar over his head (`by` is the person who asked for it and
 *  will let it go; with nobody it goes off by itself) and the ball waits at his feet. */
export function launchSpecial(m: Match, s: Player, by: Player | null = s.control === 'human' ? s : null): void {
  const b = m.ball, team = s.team, C = T.charge;
  const keeper = m.players.find((q) => q.team !== team && q.role === 'gk') ?? null;
  // a special of the AI against a team with a person: the bar is hers, to help her keeper (pressing in time takes chance away from the shot)
  const def = by ? null : m.humans.find((h) => h.team !== team) ?? null;
  const kind = specialKind(s), base = specialChance(m, s, s), easy = by ? by.controls === 'easy' : !!def && def.controls === 'easy';
  // a child gets wider zones round the same middle
  const wide = (z: readonly number[]): [number, number] => { const mid = (z[0] + z[1]) / 2, h = ((z[1] - z[0]) / 2) * (easy ? C.easyWide : 1); return [Math.max(0.2, mid - h), Math.min(1, mid + h)]; };
  m.special = { kind, team, shooter: s.id, keeper: keeper ? keeper.id : null, outcome: 'save', t: 0, dur: by ? C.dur : def ? C.defDur : C.aiDur, x: s.x, y: s.y,
    charge: { slot: by ? by.humanSlot : def ? def.slot : null, def: !!def, hit: null, p: by ? Math.min(T.special.cap, base * C.mult) : base, easy, good: wide(C.good), perfect: wide(C.perfect) } };
  m.bar[team] = 0; m.specialsUsed[team]++; m.stats.specials[team]++; s.stats2.specials++;
  if (b.state === 'owned') { b.state = 'scripted'; }
  b.owner = b.state === 'held' ? b.owner : null;
  s.state = 'special'; s.act = null; s.vx = s.vy = 0; s.supAnim = 'kick';
  setTouch(m, s);
  emit(m, 'special', s.x, s.y, 0, s.id, KIND_INDEX.indexOf(kind));
}

// ------------------------------------------------------------------------------------------------ súper patada (Nekketsu)
/** Whether the flash of the súper patada is on for this player right now. */
export const superOpen = (m: Match, p: Player): boolean => !!p.sup && p.sup.until > 0 && m.t <= p.sup.until && m.ball.owner === p.id;

/** Counts the dribble without stopping and opens the moment of the súper patada (call once per step for the carrier). */
export function trackSuper(m: Match, p: Player, dt: number): void {
  if (m.ball.owner !== p.id || m.phase !== 'play' || p.role === 'gk') { p.sup = null; return; }
  if (p.sup && m.t - p.sup.last > 0.1) p.sup = null;   // a new possession starts the count again
  const sup = (p.sup ??= { run: 0, still: 0, until: 0, last: m.t }), sp = Math.hypot(p.vx, p.vy);
  sup.last = m.t;
  if (sup.until > 0) { if (m.t > sup.until) { sup.until = 0; sup.run = 0; } return; }
  if (sp < 40) { sup.still += dt; if (sup.still > T.super.still) sup.run = 0; return; }
  sup.still = 0; sup.run += sp * dt;
  if (sup.run >= T.super.at * ((m.fury?.[p.team] ?? 0) > m.t ? T.fury.superAt : 1) && Math.abs(goalX(p.team) - p.x) <= T.super.range) {
    const easy = p.control === 'human' && p.controls === 'easy';
    sup.until = m.t + (easy ? T.super.easyWindow : T.super.window);
    emit(m, 'superready', p.x, p.y, 0, p.id);
  }
}

/** The súper patada: no cinematic, the ball flies at once along the path of the power of the shooter, knocks down whoever is in the way and,
 *  when it goes in, takes the keeper into the net with it. The result is rolled now (closer is better). */
export function superShot(m: Match, s: Player, bonus = 0, anim: NonNullable<Player['supAnim']> = 'kick'): void {
  const team = s.team, dir = attackDir(team), gx = goalX(team), b = m.ball;
  const keeper = m.players.find((q) => q.team !== team && q.role === 'gk') ?? null;
  const d = Math.abs(gx - s.x), kind = specialKind(s);
  let p = T.super.base + bonus - T.super.fall * Math.min(1, d / T.super.range);
  if (team === 1 && !humanTeam(m, 1)) p *= 0.75 + 0.25 * (DIFFICULTY[m.difficulty].special / 0.5);
  if (s.control === 'human' && s.controls === 'easy') p += T.super.easyBonus;
  const outcome = m.rng.chance(Math.min(T.super.cap, p)) ? 'goal' : 'save';
  const x0 = s.x + dir * 8, y0 = s.y, goal = outcome === 'goal';
  const x1 = goal ? gx + dir * 8 : gx - dir * (T.gk.rebound + m.rng.range(0, 14));
  const y1 = goal ? MID + m.rng.range(-27, 27) : MID + m.rng.range(-45, 45);
  const foes = m.players.filter((q) => q.team !== team && q.role !== 'gk');
  const targets = kind === 'estrellas' ? foes.filter((o) => (o.x - s.x) * dir > -40).sort((a, c) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(c.x - s.x, c.y - s.y)).slice(0, 3).map((o) => o.id) : [];
  const kindF = kind === 'carrera' ? 'canonazo' : kind;   // only Thor runs with the ball, and he never dribbles
  m.flight = { kind: kindF, team, shooter: s.id, keeper: keeper ? keeper.id : null, outcome, t: 0, dur: flightDur(kindF, Math.hypot(x1 - x0, y1 - y0)) * T.super.durK, x0, y0, x1, y1, dived: false, targets, hit: [], z0: s.z > 2 ? s.z + 8 : 0 };
  Object.assign(b, { x: x0, y: y0, z: 4 + (s.z > 2 ? s.z + 8 : 0), vx: 0, vy: 0, vz: 0, spin: 0, owner: null, state: 'scripted', inNet: false, scored: null });
  s.sup = null; s.state = 'special'; s.stateT = 0; s.act = null; s.vx = s.vy = 0; s.supAnim = anim; s.stats2.shots++; m.stats.shots[team]++;
  setTouch(m, s);
  emit(m, 'super', s.x, s.y, 0, s.id, KIND_INDEX.indexOf(kindF));
}

/** Where on the bar (0 to 1) a press falls: in the yellow, in the green or too soon. */
export function chargeZone(ch: { good: [number, number]; perfect: [number, number] }, u: number): 'perfect' | 'good' | 'early' {
  return u >= ch.perfect[0] && u <= ch.perfect[1] ? 'perfect' : u >= ch.good[0] && u <= ch.good[1] ? 'good' : 'early';
}

/** One step of a special that is loading: the bar fills, the person lets it go (or it goes off at the end), the result is rolled and the ball flies. */
export function stepCharge(m: Match, dt: number): void {
  const sp = m.special;
  if (!sp) return;
  const s = playerById(m, sp.shooter), ch = sp.charge, C = T.charge;
  // the half ended, or something took the shooter out of it: the special is lost and the ball is loose at his feet
  if (m.phase !== 'play' || !s || s.state !== 'special') {
    m.special = null;
    if (s && s.state === 'special') s.state = 'idle';
    if (m.ball.state === 'scripted' && !m.flight) { m.ball.state = 'free'; m.ball.owner = null; }
    return;
  }
  sp.t += dt;
  const f = ch.slot === null ? null : m.hin[ch.slot];
  if (f && !ch.hit && sp.t >= C.lock && (f.shootPressed || f.specialPressed)) ch.hit = chargeZone(ch, sp.t / sp.dur);
  // the shooter lets it go and the ball leaves at once; the one who defends only braces her keeper, the rival shoots when his bar is full
  if (sp.t < sp.dur && (!ch.hit || ch.def)) return;
  // a child who never presses loses nothing; anybody else just gets the base
  if (!ch.hit) ch.hit = ch.slot !== null && ch.easy ? 'good' : 'none';
  const bonus = ch.slot === null ? 0 : ch.def ? -(ch.hit === 'perfect' ? C.dPerfect : ch.hit === 'good' ? C.dGood : 0) : ch.hit === 'perfect' ? C.pPerfect : ch.hit === 'good' ? C.pGood : 0;
  sp.outcome = m.rng.chance(Math.max(0.02, Math.min(T.special.cap, ch.p + bonus))) ? 'goal' : 'save';
  emit(m, ch.def ? 'chargedef' : 'chargehit', s.x, s.y, 0, s.id, ch.hit === 'perfect' ? 2 : ch.hit === 'good' ? 1 : 0);
  resolveSpecial(m);
}

/** The charge is let go: the ball starts its scripted flight (the result is already rolled). */
function resolveSpecial(m: Match): void {
  const sp = m.special!, s = playerById(m, sp.shooter)!, b = m.ball, team = sp.team, dir = attackDir(team), gx = goalX(team);
  const foes = m.players.filter((q) => q.team !== team && q.role !== 'gk');
  const x0 = s.x + dir * 8, y0 = s.y;
  const goal = sp.outcome === 'goal';
  const x1 = goal ? gx + dir * 8 : gx - dir * (T.gk.rebound + m.rng.range(0, 14));
  const y1 = goal ? MID + m.rng.range(-27, 27) : MID + m.rng.range(-45, 45);
  const dist = Math.hypot(x1 - x0, y1 - y0);
  const targets = sp.kind === 'estrellas' ? [...foes].filter((o) => (o.x - s.x) * dir > -40).sort((a, c) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(c.x - s.x, c.y - s.y)).slice(0, 3).map((o) => o.id) : [];
  m.flight = { kind: sp.kind, team, shooter: s.id, keeper: sp.keeper, outcome: sp.outcome, t: 0, dur: flightDur(sp.kind, dist), x0, y0, x1, y1, dived: false, targets, hit: [] };
  m.special = null;
  s.stateT = 0;
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
  const q = flightPath(f, u);
  if (f.z0) q.z += f.z0 * Math.max(0, 1 - u / 0.35);
  return q;
}
function flightPath(f: Flight, u: number): { x: number; y: number; z: number } {
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
    startDive(m, keeper, f.outcome === 'save' ? f.y1 : f.y1 + (f.y1 > MID ? -66 : 66));   // a goal means he guessed the wrong side
  }
  const foes = m.players.filter((q) => q.team !== f.team && q.role !== 'gk');
  // a power shot goes through people: whoever it meets on its way (low enough to hit him) is sent flying
  const hitR = f.kind === 'canonazo' ? 20 : T.super.hitR;
  for (const o of foes) if (!f.hit.includes(o.id) && !f.targets.includes(o.id) && b.z < 40 && Math.abs(b.x - o.x) < 10 && Math.abs(o.y - b.y) < hitR) {
    f.hit.push(o.id); knockDown(m, o, playerById(m, f.shooter) ?? null, dir * T.fly.shot, Math.sign(o.y - b.y || 1) * T.fly.shot * 0.4, T.fly.shotVz, 1.2); emit(m, 'superhit', o.x, o.y, 0, o.id);
  }
  if (f.kind === 'estrellas') for (const id of f.targets) { const o = playerById(m, id)!; if (!f.hit.includes(id) && (b.x - o.x) * dir >= -4) { f.hit.push(id); startStagger(m, o, 0.6); } }
  if (u >= 1) endFlight(m, f, s);
}

function endFlight(m: Match, f: Flight, s: Player): void {
  const b = m.ball, dir = attackDir(f.team), keeper = playerById(m, f.keeper);
  m.flight = null;
  s.state = 'idle'; s.immuneT = 0;
  if (s.supAnim === 'dive') startGetup(s, T.dive.floor * 0.6);   // he threw himself flat at it: he gets up
  if (f.kind === 'carrera') { const home = slotPos(f.team, s.slot, m.form[f.team]); emit(m, 'zas', s.x, s.y, 0, s.id); s.x = home.x; s.y = home.y; }
  b.owner = null; b.state = 'free'; b.vx = b.vy = b.vz = 0; b.spin = 0; b.z = 0;
  setTouch(m, s);
  if (f.outcome === 'goal') {
    b.x = f.x1; b.y = f.y1; b.z = 6; b.inNet = true; b.scored = f.team; s.stats2.spGoals++;
    // the keeper goes into the net with the ball (Nintendo World Cup)
    if (keeper) { startTumble(m, keeper, 0.9, dir * T.fly.shot * 0.7, (f.y1 - keeper.y) * 2, T.fly.shotVz * 0.8); emit(m, 'superhit', keeper.x, keeper.y, 0, keeper.id); }
  } else {
    const inward = -dir as 1 | -1;
    b.x = f.x1; b.y = f.y1; b.vx = inward * 60; b.vy = m.rng.range(-40, 40); b.vz = 80; b.inNet = false;
    b.lastTouch = { team: keeper ? keeper.team : null, player: keeper ? keeper.id : null, t: m.t };
    if (keeper) {
      keeper.stats2.saves++; m.stats.saves[keeper.team]++;
      // now and then he does not just parry it: he keeps it (the better the keeper, the more often)
      if (m.rng.chance((keeper.stats.keeper?.skill ?? 0.6) * T.gk.superHold)) { b.x = keeper.x + inward * 6; b.y = keeper.y; holdBall(m, keeper); }
      else { keeper.noControlT = 0.3; startStagger(m, keeper, 0.3); }
      emit(m, 'save', b.x, b.y, 0, keeper.id, 2);
    }
  }
}
void ownGoalX;
