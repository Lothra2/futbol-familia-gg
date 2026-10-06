import Phaser from 'phaser';
import { JERSEY } from '../core/types';

type Ctx = CanvasRenderingContext2D;
export const PAL = {
  ink: '#2A1B3D', white: '#FFF7EC', cream: '#E6DCCF', plum: '#4A3560',
  grass1: '#6CC56A', grass2: '#58B05A', line: '#F4FFF2', area: '#C9B27A', ground: '#4AA88E', groundDark: '#2F7F72',
  sky: '#9FE3FF', skyHigh: '#7BC8F2', yellow: '#FFD447', cyan: '#7BE3FF', pink: '#FF6FB5',
  stand1: '#3F6F86', stand2: '#335B70', seat: '#E8B48F', ad1: '#FFD447', ad2: '#FF6FB5', ad3: '#7BE3FF', ad4: '#5DDB43',
};
const px = (c: Ctx, col: string, x: number, y: number, w = 1, h = 1): void => { c.fillStyle = col; c.fillRect(x, y, w, h); };

function tex(scene: Phaser.Scene, key: string, w: number, h: number, draw: (c: Ctx) => void): void {
  if (scene.textures.exists(key)) return;
  const t = scene.textures.createCanvas(key, w, h)!;
  const c = t.getContext(); c.imageSmoothingEnabled = false;
  draw(c); t.refresh();
}

/** An 8x8 ball with four frames of spin. The ink outline and a dark patch that moves round the ball. */
function ballFrames(c: Ctx): void {
  const mask = ['..####..', '.######.', '########', '########', '########', '########', '.######.', '..####..'];
  const patches: [number, number][] = [[3, 3], [4, 3], [4, 4], [3, 4]];
  patches.forEach(([ox, oy], f) => {
    mask.forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch !== '#') return;
      const edge = !(mask[y - 1]?.[x] === '#' && mask[y + 1]?.[x] === '#' && row[x - 1] === '#' && row[x + 1] === '#');
      px(c, edge ? PAL.ink : PAL.white, f * 8 + x, y);
    }));
    px(c, PAL.ink, f * 8 + ox, oy, 2, 2);
    px(c, PAL.cream, f * 8 + (7 - ox), 7 - oy);
  });
}

/** 3 x 5 pixel digits for the shirt numbers. */
const DIGITS: Record<string, string[]> = {
  '0': ['###', '#.#', '#.#', '#.#', '###'], '1': ['.#.', '##.', '.#.', '.#.', '###'], '2': ['###', '..#', '###', '#..', '###'], '3': ['###', '..#', '###', '..#', '###'],
  '4': ['#.#', '#.#', '###', '..#', '..#'], '5': ['###', '#..', '###', '..#', '###'], '6': ['###', '#..', '###', '#.#', '###'], '7': ['###', '..#', '..#', '.#.', '.#.'],
  '8': ['###', '#.#', '###', '#.#', '###'], '9': ['###', '#.#', '###', '..#', '###'],
};
/** A small plate with a number: ink border, blue plate, white digits. */
function numberTag(scene: Phaser.Scene, n: number): void {
  const s = String(n), w = s.length * 4 - 1 + 6, h = 5 + 6;
  tex(scene, `num_${n}`, w, h, (c) => {
    px(c, PAL.ink, 0, 0, w, h); px(c, '#2F6FE0', 1, 1, w - 2, h - 2);
    [...s].forEach((d, i) => DIGITS[d].forEach((row, y) => [...row].forEach((ch, x) => { if (ch === '#') px(c, '#FFFFFF', 3 + i * 4 + x, 3 + y); })));
  });
}

/** Small shapes that the views and the effects reuse. */
export function makeTextures(scene: Phaser.Scene): void {
  tex(scene, 'ball', 32, 8, ballFrames);
  for (const n of Object.values(JERSEY)) numberTag(scene, n);
  if (!scene.textures.get('ball').has('0')) { for (let i = 0; i < 4; i++) scene.textures.get('ball').add(i, 0, i * 8, 0, 8, 8); }
  tex(scene, 'shadow', 16, 6, (c) => { c.fillStyle = 'rgba(42,27,61,0.38)'; for (const [x, w, y] of [[3, 10, 0], [1, 14, 1], [0, 16, 2], [0, 16, 3], [1, 14, 4], [3, 10, 5]] as const) c.fillRect(x, y, w, 1); });
  tex(scene, 'ring', 20, 8, (c) => {
    c.fillStyle = '#fff';
    for (const [x, w, y] of [[5, 10, 0], [2, 3, 1], [15, 3, 1], [0, 2, 2], [18, 2, 2], [0, 2, 4], [18, 2, 4], [2, 3, 5], [15, 3, 5], [5, 10, 6]] as const) c.fillRect(x, y, w, 1);
    c.fillRect(0, 3, 1, 1); c.fillRect(19, 3, 1, 1);
  });
  tex(scene, 'arrow', 9, 7, (c) => {
    ['#########', '.#######.', '..#####..', '...###...', '....#....'].forEach((row, y) => [...row].forEach((ch, x) => { if (ch === '#') px(c, '#ffffff', x, y); }));
    px(c, PAL.ink, 0, 0, 9, 1);
  });
  tex(scene, 'dust', 4, 4, (c) => { px(c, PAL.cream, 1, 0, 2, 4); px(c, PAL.cream, 0, 1, 4, 2); });
  tex(scene, 'spark', 5, 5, (c) => { px(c, '#FFE45C', 2, 0, 1, 5); px(c, '#FFE45C', 0, 2, 5, 1); px(c, '#ffffff', 2, 2); });
  tex(scene, 'confetti', 3, 3, (c) => { px(c, '#ffffff', 0, 0, 2, 3); });
  tex(scene, 'star', 7, 7, (c) => { ['...#...', '...#...', '#######', '.#####.', '..###..', '.##.##.', '.#...#.'].forEach((row, y) => [...row].forEach((ch, x) => { if (ch === '#') px(c, '#FFE45C', x, y); })); });
  // stands: two tones of seats with a spot of skin colour for a spectator, repeated; ad boards: coloured blocks
  tex(scene, 'stands', 16, 10, (c) => {
    px(c, PAL.stand1, 0, 0, 16, 10); px(c, PAL.stand2, 0, 8, 16, 2);
    for (let i = 0; i < 2; i++) { px(c, PAL.seat, 3 + i * 8, 2, 2, 2); px(c, i ? '#FF6FB5' : '#7BE3FF', 2 + i * 8, 4, 4, 3); }
  });
  tex(scene, 'ads', 64, 16, (c) => {
    const cols = [PAL.ad1, PAL.ad2, PAL.ad3, PAL.ad4];
    cols.forEach((col, i) => { px(c, col, i * 16, 0, 16, 16); px(c, PAL.ink, i * 16, 0, 16, 1); px(c, PAL.ink, i * 16, 15, 16, 1); px(c, PAL.ink, i * 16 + 15, 0, 1, 16); px(c, PAL.white, i * 16 + 3, 6, 10, 4); px(c, col, i * 16 + 5, 7, 6, 2); });
  });
  tex(scene, 'banner', 8, 32, (c) => { px(c, PAL.plum, 3, 0, 2, 32); px(c, PAL.yellow, 0, 2, 8, 12); px(c, PAL.pink, 0, 14, 8, 6); px(c, PAL.ink, 0, 2, 8, 1); });
}
