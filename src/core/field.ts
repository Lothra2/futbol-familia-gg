/** Pitch geometry: the single source for the logic and the drawing (GAME_DESIGN section 5). Every size is a multiple of 8. */
export const PITCH = { w: 960, d: 400 } as const;          // x from 0 to w (goal line to goal line), y from 0 (far touchline, top of the screen) to d (near touchline)
/** The middle of the pitch across (the line between the two goals). */
export const MID = PITCH.d / 2;
/** Scales from the old side-view pitch (160 deep, 48-wide goal) to this one: SY for things measured against the width of the pitch
 *  (lanes, wings, touchlines), GY for things measured against the goal (aim, posts, the keeper). */
export const SY = PITCH.d / 160;
export const GY = 72 / 48;
export const ESCAPE = { x0: -40, x1: 1000, y0: -24, y1: PITCH.d + 24 } as const;   // ball and players never leave this box
export const GOAL = { y0: MID - 36, y1: MID + 36, bar: 28, net: 16 } as const;       // mouth between the posts, crossbar height, depth of the net
export const AREA_BIG = { len: 110, y0: MID - 132, y1: MID + 132 } as const;
export const AREA_SMALL = { len: 40, y0: MID - 56, y1: MID + 56 } as const;
export const PENALTY_X = 80;
export const CENTER = { x: PITCH.w / 2, y: MID, r: 56 } as const;
/** The pitch always occupies the 160 px above the 16 px near band (ART_BIBLE section 2): world y = 0 sits at screen y = viewH - 176. */
export const pitchScreenTop = (viewH: number): number => viewH - 176;
/** Camera x limits so the stands behind the goals are visible but nothing outside the drawn width is. */
export const CAM_MIN_X = -64;
export const CAM_MAX_X = 1024;

import type { Team } from './state';
/** Team 0 (the family) attacks towards +x, team 1 towards -x. Both halves, no change of sides. */
export const attackDir = (t: Team): 1 | -1 => (t === 0 ? 1 : -1);
/** x of the goal line a team attacks and of the one it defends. */
export const goalX = (t: Team): number => (t === 0 ? PITCH.w : 0);
export const ownGoalX = (t: Team): number => (t === 0 ? 0 : PITCH.w);

/** The formations of 6 (Nintendo World Cup): keeper and five in the field. Positions for a team attacking +x. Slot 0 is always the keeper. */
export type FormationId = '2-1-2' | '1-2-2' | '2-2-1';
export const FORMATION_IDS: FormationId[] = ['2-1-2', '1-2-2', '2-2-1'];
type Spot = { x: number; y: number; role: 'gk' | 'def' | 'mid' | 'fwd' };
export const FORMATIONS: Record<FormationId, readonly Spot[]> = {
  '2-1-2': [{ x: 16, y: MID, role: 'gk' }, { x: 170, y: MID - 120, role: 'def' }, { x: 170, y: MID + 120, role: 'def' }, { x: 300, y: MID, role: 'mid' }, { x: 410, y: MID - 120, role: 'fwd' }, { x: 410, y: MID + 120, role: 'fwd' }],
  '1-2-2': [{ x: 16, y: MID, role: 'gk' }, { x: 160, y: MID, role: 'def' }, { x: 290, y: MID - 140, role: 'mid' }, { x: 290, y: MID + 140, role: 'mid' }, { x: 410, y: MID - 90, role: 'fwd' }, { x: 410, y: MID + 90, role: 'fwd' }],
  '2-2-1': [{ x: 16, y: MID, role: 'gk' }, { x: 170, y: MID - 120, role: 'def' }, { x: 170, y: MID + 120, role: 'def' }, { x: 300, y: MID - 130, role: 'mid' }, { x: 300, y: MID + 130, role: 'mid' }, { x: 420, y: MID, role: 'fwd' }],
};
export const slotPos = (t: Team, slot: number, form: FormationId = '2-1-2'): { x: number; y: number } => {
  const b = FORMATIONS[form][slot] ?? FORMATIONS[form][0];
  return { x: t === 0 ? b.x : PITCH.w - b.x, y: b.y };
};
export const slotRole = (slot: number, form: FormationId = '2-1-2'): Spot['role'] => FORMATIONS[form][slot]?.role ?? 'fwd';
