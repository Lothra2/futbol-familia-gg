/** Pitch geometry: the single source for the logic and the drawing (GAME_DESIGN section 5). Every size is a multiple of 8. */
export const PITCH = { w: 960, d: 160 } as const;          // x from 0 to w (goal line to goal line), y from 0 (far side) to d (near side)
export const ESCAPE = { x0: -40, x1: 1000, y0: -12, y1: 172 } as const;   // ball and players never leave this box
export const GOAL = { y0: 56, y1: 104, bar: 28, net: 16 } as const;       // mouth between the posts, crossbar height, depth of the net
export const AREA_BIG = { len: 96, y0: 16, y1: 144 } as const;
export const AREA_SMALL = { len: 32, y0: 48, y1: 112 } as const;
export const PENALTY_X = 72;
export const CENTER = { x: PITCH.w / 2, y: PITCH.d / 2, r: 40 } as const;
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

/** Open play base position of each formation slot, for a team attacking +x. Slot 0 keeper, 1 and 2 defenders, 3 and 4 forwards. */
export const FORMATION: readonly { x: number; y: number }[] = [
  { x: 14, y: 80 }, { x: 170, y: 50 }, { x: 170, y: 110 }, { x: 340, y: 56 }, { x: 340, y: 104 },
];
export const slotPos = (t: Team, slot: number): { x: number; y: number } => {
  const b = FORMATION[slot];
  return { x: t === 0 ? b.x : PITCH.w - b.x, y: b.y };
};
