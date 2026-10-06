import { Rng } from '../../core/rng';

type Ctx = CanvasRenderingContext2D;
/** The poses of a fan (ART_BIBLE section 9): seated, swaying, standing, arms up, jumping, waving with one arm, and holding a flag. */
export type FanPose = 'sit' | 'sway' | 'stand' | 'up' | 'jump' | 'waveL' | 'waveR' | 'flag';
export type FanKind = 'human' | 'dragon' | 'tiburon' | 'buho' | 'mapache';
export interface Fan { col: number; row: number; kind: FanKind; shirt: string; skin: string; hair: string; phase: number; calm: boolean }

export const SEAT = 8;           // a seat every 8 px
export const ROW_H = 10;         // a step every 10 px
export const AISLE = 12;         // a stair every 12 seats (96 px)
const SHIRTS = ['#FFD447', '#E8423A', '#FFF7EC', '#9B5DE5', '#2FB5A8', '#FF8A2A'];
const SKINS = ['#F4C9A0', '#D9A06F', '#B97D4F', '#8A5A3A'];
const HAIRS = ['#2A1B3D', '#5A3A24', '#C9892B', '#E8E0D0'];
const SCALES: Record<FanKind, string[]> = {
  human: SKINS, dragon: ['#E8642A', '#D4482F', '#F08A3A', '#C73B5A'], tiburon: ['#7FA6C9', '#5E86B0', '#9DBBD6'], buho: ['#B98A5A', '#8E6A44', '#D6B582'], mapache: ['#9AA3AB', '#7C858D', '#B8C0C6'],
};

/** All the seats of a stand `cols` seats wide and `rows` rows high, and who sits in each. `mix` is the share of each species (the home crowd). */
export function makeFans(seed: number, cols: number, rows: number, mix: Partial<Record<FanKind, number>>): Fan[] {
  const rng = new Rng(seed), out: Fan[] = [];
  const kinds = Object.keys(mix) as FanKind[], total = kinds.reduce((a, k) => a + (mix[k] ?? 0), 0);
  const pick = (): FanKind => { let r = rng.next() * total; for (const k of kinds) { r -= mix[k] ?? 0; if (r <= 0) return k; } return 'human'; };
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
    if (col % AISLE === AISLE - 1) continue;            // the stairs
    if (rng.next() < 0.06) continue;                    // an empty seat
    const kind = pick(), sc = SCALES[kind];
    out.push({ col, row, kind, shirt: SHIRTS[Math.floor(rng.next() * SHIRTS.length)], skin: sc[Math.floor(rng.next() * sc.length)], hair: HAIRS[Math.floor(rng.next() * HAIRS.length)], phase: Math.floor(rng.next() * 4), calm: rng.next() < 0.1 });
  }
  return out;
}

const px = (c: Ctx, col: string, x: number, y: number, w = 1, h = 1): void => { c.fillStyle = col; c.fillRect(x, y, w, h); };
const shade = (hex: string, k: number): string => { const n = parseInt(hex.slice(1), 16), r = Math.round(((n >> 16) & 255) * k), g = Math.round(((n >> 8) & 255) * k), b = Math.round((n & 255) * k); return `rgb(${r},${g},${b})`; };

/** Draws one fan in an 8 x 10 box with its top-left corner at (x, y). `dark` (1 = full light) makes the back rows a little darker. */
export function drawFan(c: Ctx, f: Fan, pose: FanPose, x: number, y: number, dark = 1): void {
  const up = pose === 'jump' ? -2 : pose === 'stand' || pose === 'up' ? -1 : 0;
  const sway = pose === 'sway' ? 1 : 0;
  const by = y + up, shirt = shade(f.shirt, dark), skin = shade(f.skin, dark);
  const cheer = pose === 'up' || pose === 'jump' || pose === 'flag' || pose === 'waveL' || pose === 'waveR';
  // body and head
  px(c, shirt, x + 1, by + 5, 6, 5);
  px(c, skin, x + 2 + sway, by + 1, 4, 4);
  // what makes the species: hair, horns, fin, tufts, mask and ears
  if (f.kind === 'human') { const h = shade(f.hair, dark); px(c, h, x + 2 + sway, by, 4, 1); px(c, h, x + 1 + sway, by + 1, 1, 2); px(c, h, x + 6 + sway, by + 1, 1, 2); }
  else if (f.kind === 'dragon') { px(c, '#F6E7C8', x + 2 + sway, by, 1, 1); px(c, '#F6E7C8', x + 5 + sway, by, 1, 1); px(c, shade('#F6E7C8', dark), x + 3 + sway, by + 4, 2, 1); }
  else if (f.kind === 'tiburon') { px(c, shade('#4F6E92', dark), x + 3 + sway, by - 1, 2, 2); }
  else if (f.kind === 'buho') { px(c, shade('#6E5133', dark), x + 2 + sway, by, 1, 1); px(c, shade('#6E5133', dark), x + 5 + sway, by, 1, 1); px(c, '#FFF7EC', x + 3 + sway, by + 2, 2, 2); }
  else { px(c, '#2A1B3D', x + 2 + sway, by + 2, 4, 1); px(c, skin, x + 1 + sway, by, 1, 2); px(c, skin, x + 6 + sway, by, 1, 2); }
  // eyes and mouth
  px(c, '#2A1B3D', x + 3 + sway, by + 3, 1, 1); px(c, '#2A1B3D', x + 5 + sway, by + 3, 1, 1);
  if (cheer) px(c, '#8A2A3A', x + 4 + sway, by + 4, 1, 1);
  // arms
  if (pose === 'up' || pose === 'jump') { px(c, skin, x, by + 1, 1, 5); px(c, skin, x + 7, by + 1, 1, 5); }
  else if (pose === 'waveL') { px(c, skin, x, by + 1, 1, 5); px(c, skin, x + 7, by + 6, 1, 3); }
  else if (pose === 'waveR') { px(c, skin, x + 7, by + 1, 1, 5); px(c, skin, x, by + 6, 1, 3); }
  else if (pose === 'flag') { px(c, skin, x + 7, by + 1, 1, 5); px(c, '#E6DCCF', x + 8, by - 3, 1, 8); px(c, f.shirt, x + 9, by - 3, 3, 3); px(c, skin, x, by + 6, 1, 3); }
  else { px(c, skin, x, by + 6, 1, 3); px(c, skin, x + 7, by + 6, 1, 3); }
}

/** The pose of a fan at animation frame k (0 to 3) of a state. The same function draws the baked images and answers the tests. */
export function poseOf(f: Fan, state: 'idle' | 'cheer' | 'stand' | 'wave' | 'waveup', k: number, crest = -1, x = 0): FanPose {
  if (state === 'waveup') return f.calm ? 'sit' : 'up';      // the picture that the window of the wave shows
  if (state === 'cheer') return f.calm ? (k % 2 ? 'stand' : 'sway') : (k + f.phase) % 2 ? 'jump' : 'up';
  if (state === 'stand') return f.calm ? 'sit' : (k + f.phase) % 4 < 2 ? 'stand' : 'sway';
  if (state === 'wave') { if (!f.calm && Math.abs(x - crest) < 70) return 'up'; return f.phase === 0 && k % 2 ? 'sway' : 'sit'; }
  if ((k + f.phase) % 4 === 1 && f.phase === 3) return 'waveL';
  return (k + f.phase) % 4 < 2 ? 'sit' : 'sway';
}
