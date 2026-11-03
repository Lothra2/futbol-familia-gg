import Phaser from 'phaser';

/** The shirt colour of each family atlas (tools/nwc/nwc_gen.ts FAMILY): the pixels of that hue are the ones an outfit repaints. */
export const SHIRT: Record<string, string> = { papa: '#c40f14', mama: '#6e3db8', sophie: '#91be35', alana: '#fd7eac', juandi: '#0a47af' };

const hsv = (r: number, g: number, b: number): [number, number, number] => {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, mx ? d / mx : 0, mx / 255];
};
const rgb = (h: number, s: number, v: number): [number, number, number] => {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
};

/** Makes (once) the atlas `<key>_<outfit>`: the shirt of the family member repainted as a rainbow (bands down the body) or as a night sky with
 *  gold stars, keeping the light and shade of every pixel so the drawing stays the same. Returns the key to use. */
export function outfitAtlas(scene: Phaser.Scene, key: string, art: string, outfit: string): string {
  const out = `${key}_${outfit}`, shirt = SHIRT[art];
  if (!shirt || (outfit !== 'arcoiris' && outfit !== 'estrellas')) return key;
  if (scene.textures.exists(out)) return out;
  const src = scene.textures.get(key).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
  const w = src.width, h = src.height, cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const c = cv.getContext('2d')!; c.drawImage(src, 0, 0);
  const img = c.getImageData(0, 0, w, h), px = img.data;
  const n = parseInt(shirt.slice(1), 16), [sh, ss] = hsv((n >> 16) & 255, (n >> 8) & 255, n & 255);
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 8) continue;
    const [hh, s, v] = hsv(px[i], px[i + 1], px[i + 2]);
    let dh = Math.abs(hh - sh); dh = Math.min(dh, 360 - dh);
    if (dh > 20 || s < ss * 0.45 || v < 0.12) continue;
    const p = i / 4, x = p % w, y = Math.floor(p / w), cy = y % 48;
    let r: [number, number, number];
    if (outfit === 'arcoiris') r = rgb((Math.floor(cy / 3) * 50) % 360, 0.75, Math.min(1, v * 1.15));
    else r = (x * 7 + y * 13) % 19 === 0 ? [255, 228, 92] : rgb(232, 0.65, Math.min(1, v * 0.55));
    px[i] = r[0]; px[i + 1] = r[1]; px[i + 2] = r[2];
  }
  c.putImageData(img, 0, 0);
  scene.textures.addSpriteSheet(out, cv as unknown as HTMLImageElement, { frameWidth: 48, frameHeight: 48 });
  return out;
}
