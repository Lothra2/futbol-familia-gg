import { PITCH } from './field';

/** The camera of Nintendo World Cup: from above and a little to the south. The ground is drawn wider than it is deep (PY < PX) and a height lifts a
 *  thing straight up the screen. World (0, 0, 0) is screen (0, 0); the Phaser camera scrolls over it. Pure, so the view and the tests share it. */
export const PX = 1.3;
export const PY = 1.0;
export const PZ = 1.3;
/** How much ground around the lines is drawn (world units): the stands live above the far touchline, the boards behind the goals. */
export const MARGIN = { x: 76, top: 72, bottom: 30 } as const;
export const sx = (x: number): number => x * PX;
export const sy = (y: number, z = 0): number => y * PY - z * PZ;
/** The perspective of Nintendo World Cup: the lines that run up the pitch lean, opening towards the bottom of the screen (the near side is closer
 *  to the camera). A point is pushed away from the middle of the view by `PK` of its distance, times how far below the middle of the view it is.
 *  The view tells where its middle is every frame (setView); the core never uses it. Heights do not change it (it follows the ground). */
export const PK = 0.3;
let VCX = 0, VCY = 0, VH = 270;
export function setView(cx: number, cy: number, h: number): void { VCX = cx; VCY = cy; VH = Math.max(1, h); }
/** Screen x of a point on the ground at world (x, y), with the perspective. */
export const wx = (x: number, y: number): number => { const X = x * PX; return VCX + (X - VCX) * (1 + PK * ((y * PY - VCY) / VH)); };
/** Screen box of everything that is drawn: the camera never shows past it. */
export const BOUNDS = { x0: sx(-MARGIN.x), x1: sx(PITCH.w + MARGIN.x), y0: sy(-MARGIN.top), y1: sy(PITCH.d + MARGIN.bottom) } as const;
/** Draw order of something standing on the ground at world y (the farther, the earlier). */
export const depthAt = (y: number): number => 200 + y;
