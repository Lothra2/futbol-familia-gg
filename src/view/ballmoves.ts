import type { SpecialKind } from '../core/state';
import { PAL_BALL, PAL_HOT, type BallPal, type BallShape } from './ballart';

/** The set of things the ball does (Nekketsu: the ball of a power shot is never just a ball). Each move is a shape that changes with the
 *  time, the colours it flickers through and what is drawn round it. The powers and the kicks of the match pick from this set. */
export type MoveId =
  | 'redondo'    // the ball of every day
  | 'ovalo'      // a hard shot: an oval along its way
  | 'bala'       // the bullet: a long oval with lines of speed and the air it breaks
  | 'cometa'     // the fireball: a tail of fire and embers
  | 'gota'       // the drop: round in front, thin behind (a volley)
  | 'banana'     // the crescent of a shot with effect, bent the way it curves
  | 'bumeran'    // a crescent that spins
  | 'disco'      // the disc that turns over itself like a coin
  | 'gelatina'   // long and flat by turns, like jelly
  | 'rayo'       // a thin lens with the bolt it leaves
  | 'estrella'   // a ball with five points that spins
  | 'triple'     // three stars that weave
  | 'sierra'     // a saw of four blades with leaves
  | 'taladro'    // the drill of the spinning kick: an oval with rings that turn round it
  | 'gigante'    // the ball swells for a moment
  | 'tortilla'   // flat against whatever it hit (a bounce, a header)
  | 'burbuja'    // inside a bubble that wobbles
  | 'aguja'      // the spike that falls from the sky
  | 'carrera';   // at the feet of Thor, with dust
export const MOVES: MoveId[] = ['redondo', 'ovalo', 'bala', 'cometa', 'gota', 'banana', 'bumeran', 'disco', 'gelatina', 'rayo', 'estrella', 'triple', 'sierra', 'taladro', 'gigante', 'tortilla', 'burbuja', 'aguja', 'carrera'];

export interface Look {
  move: MoveId; shape: BallShape;
  /** The colours it flickers through (one every twentieth of a second). */
  pals: BallPal[];
  /** Px of fire behind it. */
  flame?: number;
  /** Afterimages behind it, and whether two more balls weave round it. */
  ghosts: number; twins?: boolean;
  /** Radians it spins over itself every frame, on top of its rolling. */
  spin: number;
}

/** How the ball looks doing `move`: `r` its radius, (ux, uy) the way it goes on the screen, `t` the clock (it drives what repeats), `tau` the
 *  seconds since the move began, `k` how strong it is (0 to 1: how hard the shot, how much effect). Pure. */
export function lookOf(move: MoveId, r: number, ux: number, uy: number, t: number, tau = 0, k = 1): Look {
  const base = { move, pals: [PAL_BALL], ghosts: 0, spin: 0 };
  switch (move) {
    case 'ovalo': { const s = 1 + 0.42 * k; return { ...base, shape: { r, ux, uy, sx: s, sy: 1 / Math.sqrt(s) } }; }
    case 'bala': return { ...base, shape: { r, ux, uy, sx: 2.2, sy: 0.68, taper: 0.18 }, pals: [PAL_HOT.blanco, PAL_HOT.fuego], ghosts: 5, spin: 0.5 };
    case 'cometa': return { ...base, shape: { r, ux, uy, sx: 1.12, sy: 0.95 }, pals: [PAL_HOT.fuego, PAL_HOT.blanco, PAL_HOT.fuego], flame: 30, spin: 0.5 };
    case 'gota': return { ...base, shape: { r, ux, uy, sx: 1.5, sy: 0.9, taper: 0.5 }, ghosts: 2 };
    case 'banana': { const b = Math.max(-1, Math.min(1, k)); return { ...base, shape: { r, ux, uy, sx: 1.25 + 0.27 * Math.abs(b), sy: 0.8 - 0.24 * Math.abs(b), bend: 0.52 * b } }; }
    case 'bumeran': { const a = t * 20; return { ...base, shape: { r, ux: Math.cos(a), uy: Math.sin(a), sx: 1.55, sy: 0.6, bend: 0.55 }, pals: [PAL_HOT.oro, PAL_HOT.blanco], ghosts: 4 }; }
    case 'disco': { const f = Math.abs(Math.cos(t * 13)); return { ...base, shape: { r, ux: -uy, uy: ux, sx: 1.1, sy: Math.max(0.22, f) }, spin: 0.3 }; }
    case 'gelatina': { const w = Math.sin(t * 22) * k; return { ...base, shape: { r, ux: 1, uy: 0, sx: 1.15 + 0.35 * w, sy: 1.0 - 0.3 * w }, pals: [PAL_HOT.agua, PAL_HOT.agua, PAL_BALL], ghosts: 3 }; }
    case 'rayo': return { ...base, shape: { r, ux, uy, sx: 1.7, sy: 0.6 }, pals: [PAL_HOT.rayo, PAL_HOT.blanco, PAL_BALL], ghosts: 3, spin: 0.5 };
    case 'estrella': return { ...base, shape: { r: r + 2, lobes: 5, lobe: 0.24, phase: t * 14 }, pals: [PAL_HOT.oro, PAL_HOT.lila, PAL_HOT.blanco], spin: 0.4 };
    case 'triple': return { ...base, shape: { r: r + 1, lobes: 5, lobe: 0.24, phase: t * 14 }, pals: [PAL_HOT.lila, PAL_HOT.oro, PAL_BALL], twins: true, spin: 0.4 };
    case 'sierra': return { ...base, shape: { r: r + 2, lobes: 4, lobe: 0.3, phase: t * 26 }, pals: [PAL_HOT.hoja, PAL_HOT.oro], ghosts: 3, spin: 0.6 };
    case 'taladro': return { ...base, shape: { r, ux, uy, sx: 1.55, sy: 0.74, taper: 0.25 }, pals: [PAL_HOT.blanco, PAL_BALL, PAL_HOT.rayo], ghosts: 3, spin: 0.7 };
    case 'gigante': { const g = 1 + 0.55 * Math.sin(Math.min(1, tau / 0.14) * Math.PI); return { ...base, shape: { r: r * g }, pals: [PAL_HOT.blanco, PAL_BALL], spin: 0.5 }; }
    case 'tortilla': return { ...base, shape: { r, ux, uy, sx: 0.72, sy: 1.28 } };
    case 'burbuja': { const w = Math.sin(t * 9); return { ...base, shape: { r, sx: 1 + 0.08 * w, sy: 1 - 0.08 * w }, pals: [PAL_BALL, PAL_HOT.agua] }; }
    case 'aguja': return { ...base, shape: { r, ux, uy, sx: 2.1, sy: 0.62, taper: 0.45 }, pals: [PAL_HOT.oro, PAL_HOT.blanco], ghosts: 4 };
    case 'carrera': return { ...base, shape: { r, ux, uy, sx: 1.4, sy: 0.86 }, pals: [PAL_BALL, PAL_HOT.blanco], ghosts: 2, spin: 0.4 };
    default: return { ...base, shape: { r } };
  }
}

/** The colours of the rainbow shot (the disc of Sophie flickers through all of them). */
const RAINBOW_PALS = [PAL_HOT.rosa, PAL_HOT.rayo, PAL_HOT.hoja, PAL_HOT.agua, PAL_HOT.lila];

/** What the ball of each power does `tau` s after it leaves the boot (`falling`: it is coming down on the screen). A power starts with a
 *  flash of its own and then becomes its shape. */
export function moveOfPower(kind: SpecialKind, tau: number, falling: boolean): MoveId {
  switch (kind) {
    case 'arcoiris': return 'disco';
    case 'burbuja': return 'burbuja';
    case 'canonazo': return tau < 0.14 ? 'gigante' : 'bala';
    case 'estrellas': return tau < 0.18 ? 'estrella' : 'triple';
    case 'relampago': return 'rayo';
    case 'carrera': return 'carrera';
    case 'llamarada': return 'cometa';
    case 'ola': return 'gelatina';
    case 'picada': return falling ? 'aguja' : 'bumeran';
    default: return 'sierra';   // hojas
  }
}
/** The look of the ball of a power: its move, in its colours (a power is bigger than a ball of every day). */
export function lookOfPower(kind: SpecialKind, r: number, ux: number, uy: number, t: number, tau: number, falling: boolean): Look {
  const big = r + 2 + (Math.floor(t * 15) % 2), look = lookOf(moveOfPower(kind, tau, falling), kind === 'burbuja' ? r : big, ux, uy, t, tau);
  if (kind === 'arcoiris') look.pals = RAINBOW_PALS;
  return look;
}

/** What a kick of the match does to the ball, and for how long (s) it shows while the ball still flies faster than `min` px/s on the screen. */
export const KICK_MOVE: Record<string, { move: MoveId; dur: number; min: number }> = {
  spin: { move: 'taladro', dur: 0.9, min: 180 },
  volley: { move: 'gota', dur: 0.5, min: 220 },
  chilena: { move: 'disco', dur: 0.45, min: 120 },
  header: { move: 'tortilla', dur: 0.08, min: 0 },
};
