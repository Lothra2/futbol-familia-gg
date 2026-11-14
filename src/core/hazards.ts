import { DIFFICULTY, MATES, T } from './tuning';
import { PITCH } from './field';
import { emit } from './events';
import { startTumble } from './actions';
import type { Match, Player } from './state';
import type { InputFrame } from './types';

/** Las trampas de cada cancha (Nintendo World Cup had ice, mud and stones): each kingdom has its own thing lying on the pitch.
 *  - Arrecife, `charco`: a puddle. Whoever sprints through it slips and falls; the ball loses its speed in the water.
 *  - Volcán, `geiser`: a vent that smokes and then blows. Whoever stands on it when it blows goes up in the air, and so does the ball.
 *  - Bosque, `barro`: mud. Everybody is slow in it and the ball dies there.
 *  - Nubes, `nube`: a springy cloud. Whoever steps on it bounces high, with the ball if he has it.
 *  A child on easy controls never falls because of them: she splashes, flies and bounces, and plays on. */
export type World = 'volcan' | 'arrecife' | 'nubes' | 'bosque';
export type HazardKind = 'charco' | 'geiser' | 'barro' | 'nube';
/** `rx`, `ry`: half its size on the ground; `t0`: the turn of a geyser in the round of all of them; `pop`: when it last sprang or blew on something. */
export interface Hazard { kind: HazardKind; x: number; y: number; rx: number; ry: number; t0: number; pop: number }

const KIND: Record<World, HazardKind> = { arrecife: 'charco', volcan: 'geiser', bosque: 'barro', nubes: 'nube' };
/** Where they lie, for the left half; each has its twin on the other side of the centre spot, so no team has it easier. */
const SPOTS: Record<HazardKind, [number, number][]> = {
  charco: [[300, 110], [400, 300], [230, 250]],
  geiser: [[330, 120], [330, 290], [460, 60]],
  barro: [[290, 200], [430, 90]],
  nube: [[300, 92], [300, 308]],
};

/** The traps of the pitch of a kingdom. The same ones every match (they are part of the pitch). */
export function layoutHazards(world: World): Hazard[] {
  const kind = KIND[world], S = T.haz.size[kind], out: Hazard[] = [];
  SPOTS[kind].forEach(([x, y], i) => {
    out.push({ kind, x, y, rx: S[0], ry: S[1], t0: i * 2, pop: -9 });
    out.push({ kind, x: PITCH.w - x, y: PITCH.d - y, rx: S[0], ry: S[1], t0: i * 2 + 1, pop: -9 });
  });
  return out;
}

const inside = (h: Hazard, x: number, y: number, grow = 0): boolean => { const dx = (x - h.x) / (h.rx + grow), dy = (y - h.y) / (h.ry + grow); return dx * dx + dy * dy <= 1; };
/** What a geyser is doing: 0 asleep, 1 smoking (it is about to blow), 2 blowing. Each one has its turn in the round. */
export function geyserState(h: Hazard, t: number): 0 | 1 | 2 {
  const G = T.haz.geyser, n = 6, u = (((t - h.t0 * (G.period / n)) % G.period) + G.period) % G.period;
  return u < G.period - G.warn - G.blow ? 0 : u < G.period - G.blow ? 1 : 2;
}

/** One step of the traps: who is in the mud, who slips, who flies. Runs before the players move, only while the ball is in play. */
export function stepHazards(m: Match, dt: number): void {
  if (!m.hazards.length) return;
  for (const p of m.players) p.mud = 1;
  if (m.phase !== 'play') return;
  const H = T.haz, b = m.ball;
  for (const h of m.hazards) {
    const blowing = h.kind === 'geiser' && geyserState(h, m.t) === 2;
    for (const p of m.players) {
      if (p.role === 'gk' || p.z > 1 || !inside(h, p.x, p.y)) continue;
      const easy = p.control === 'human' && p.controls === 'easy', busy = p.state === 'tumble' || p.state === 'special' || p.state === 'celebrate' || p.state === 'sad';
      if (h.kind === 'barro') { p.mud = easy ? H.mud.easy : H.mud.slow; continue; }
      if (busy || (p.hazT ?? 0) > m.t) continue;
      if (h.kind === 'charco') {
        // only a sprint slips: who walks or runs through it only gets wet
        if (p.state !== 'sprint') continue;
        p.hazT = m.t + H.cd; h.pop = m.t;
        if (!easy) { startTumble(m, p, H.slip.dur, p.vx * H.slip.keep, p.vy * H.slip.keep, H.slip.vz); if (p.act) p.act.slip = true; }
        emit(m, 'slip', p.x, p.y, 0, p.id, easy ? 0 : 1);
      } else if (h.kind === 'geiser') {
        if (!blowing) continue;
        p.hazT = m.t + H.cd; h.pop = m.t;
        if (easy) { p.vz = H.geyser.vz; p.z = 0.5; } else startTumble(m, p, H.geyser.dur, p.vx * 0.4, p.vy * 0.4, H.geyser.vz);
        emit(m, 'geyser', p.x, p.y, 0, p.id, easy ? 0 : 1);
      } else if (!p.act || p.act.kind === 'kick') {
        // the springy cloud: up he goes, with the ball if he has it, and he can do up there whatever a jump allows
        p.hazT = m.t + H.cloud.cd; h.pop = m.t;
        p.vz = H.cloud.vz; p.z = 0.5;
        emit(m, 'boing', p.x, p.y, 0, p.id);
      }
    }
    // the ball
    if (b.state !== 'free' || !inside(h, b.x, b.y, 2)) continue;
    const onGround = b.z <= 1 && b.vz <= 0;
    if (h.kind === 'charco' || h.kind === 'barro') {
      if (onGround) { const k = Math.exp(-(h.kind === 'barro' ? H.mud.drag : H.slip.drag) * dt); b.vx *= k; b.vy *= k; }
    } else if (h.kind === 'geiser') {
      if (blowing && b.z < 12 && b.vz < H.geyser.ball * 0.5) { b.vz = H.geyser.ball; b.z = Math.max(b.z, 1); h.pop = m.t; emit(m, 'geyser', b.x, b.y, 0, undefined, 2); }
    } else if (b.z < 4 && b.vz <= 0 && m.t - h.pop > 0.15) { b.vz = Math.max(H.cloud.ball, -b.vz); b.z = Math.max(b.z, 1); h.pop = m.t; emit(m, 'boing', b.x, b.y, 0, undefined, 2); }
  }
}

/** The AI knows its pitch, more or less: before a puddle each player decides once whether he remembers to stop sprinting (the better the
 *  rivals, the more often they do). Called with the frame the AI has just made for him. */
export function aiMindsHazards(m: Match, p: Player, f: InputFrame): void {
  if (!f.sprint || !m.hazards.length || m.hazards[0].kind !== 'charco') return;
  const ax = p.x + p.vx * 0.3, ay = p.y + p.vy * 0.3;
  const i = m.hazards.findIndex((h) => inside(h, ax, ay, 4) || inside(h, p.x, p.y, 4));
  if (i < 0) return;
  const A = p.ai;
  if (!A.puddle || A.puddle.i !== i || m.t - A.puddle.t > 3) A.puddle = { i, t: m.t, careful: m.rng.chance(p.team === 0 ? MATES.puddle : DIFFICULTY[m.difficulty].puddle) };
  A.puddle.t = m.t;
  if (A.puddle.careful) f.sprint = false;
}

/** For the tests and the view: the trap a point is in, if any. */
export const hazardAt = (m: Match, x: number, y: number): Hazard | undefined => m.hazards.find((h) => inside(h, x, y));
export type { Player };
