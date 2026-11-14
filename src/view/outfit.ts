import Phaser from 'phaser';

/** The shirt colour of each family atlas (the athletes of the Nekketsu Olympic GG, base tone of their top; Juandi from the previous version): the pixels of that hue are the ones an outfit repaints. */
export const SHIRT: Record<string, string> = { papa: '#2a5bd7', mama: '#f4a5b5', sophie: '#3bb35a', alana: '#e8508f', juandi: '#0a47af' };

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
  const cell = scene.textures.getFrame(key, 0)?.width ?? 32;
  const w = src.width, h = src.height, cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const c = cv.getContext('2d')!; c.drawImage(src, 0, 0);
  const img = c.getImageData(0, 0, w, h), px = img.data;
  const n = parseInt(shirt.slice(1), 16), [sh, ss] = hsv((n >> 16) & 255, (n >> 8) & 255, n & 255);
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 8) continue;
    const [hh, s, v] = hsv(px[i], px[i + 1], px[i + 2]);
    let dh = Math.abs(hh - sh); dh = Math.min(dh, 360 - dh);
    if (dh > 20 || s < ss * 0.45 || v < 0.12) continue;
    const p = i / 4, x = p % w, y = Math.floor(p / w), cy = y % cell;
    let r: [number, number, number];
    if (outfit === 'arcoiris') r = rgb((Math.floor(cy / 2) * 50) % 360, 0.75, Math.min(1, v * 1.15));
    else r = (x * 7 + y * 13) % 19 === 0 ? [255, 228, 92] : rgb(232, 0.65, Math.min(1, v * 0.55));
    px[i] = r[0]; px[i + 1] = r[1]; px[i + 2] = r[2];
  }
  c.putImageData(img, 0, 0);
  scene.textures.addSpriteSheet(out, cv as unknown as HTMLImageElement, { frameWidth: cell, frameHeight: cell });
  return out;
}

interface Uniforms { kits: Record<string, [string, string]>; clothes: Record<string, { top: string[]; bot: string[] }> }
const hexRgb = (h: string): [number, number, number] => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

/** Makes (once) the atlas `<key>_uni`: a rival in the kit of his kingdom. The rivals wear each his own clothes and are hard to tell from the
 *  family at a glance; `uniformes.json` (tools/build_uniformes.py) says which exact colours of each sheet are clothes, the top and the bottom.
 *  Those are repainted with the two colours of the kit, the darkest tone of what he wore as its shade and the lightest as its light, so the
 *  folds stay. On a figure that stands, the top of it (the head) is left alone: the white of an eye is the white of a shirt. */
export function uniformAtlas(scene: Phaser.Scene, key: string, art: string): string {
  const out = `${key}_uni`, data = scene.cache.json.get('uniformes') as Uniforms | undefined;
  const cl = data?.clothes[art], kit = data?.kits[art.split('_')[1] ?? ''];
  if (!cl || !kit || (!cl.top.length && !cl.bot.length)) return key;
  if (scene.textures.exists(out)) return out;
  const src = scene.textures.get(key).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
  const cell = scene.textures.getFrame(key, 0)?.width ?? 48;
  const w = src.width, h = src.height, cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const c = cv.getContext('2d')!; c.drawImage(src, 0, 0);
  const img = c.getImageData(0, 0, w, h), px = img.data, map = new Map<number, [number, number, number]>();
  [cl.top, cl.bot].forEach((list, k) => {
    const cs = list.map(hexRgb), lum = cs.map((q) => (0.3 * q[0] + 0.59 * q[1] + 0.11 * q[2]) / 255), lo = Math.min(...lum), hi = Math.max(...lum);
    const kn = hexRgb(kit[k]), [kh, ks, kv] = hsv(kn[0], kn[1], kn[2]);
    cs.forEach((q, i) => {
      const u = hi - lo > 0.04 ? (lum[i] - lo) / (hi - lo) : 0.7;
      map.set((q[0] << 16) | (q[1] << 8) | q[2], rgb(kh, ks * (1 - (0.3 * Math.max(0, u - 0.75)) / 0.25), kv * (0.58 + 0.42 * u)));
    });
  });
  for (let fy = 0; fy < h; fy += cell) for (let fx = 0; fx < w; fx += cell) {
    // the box of what is drawn in this cell: if he stands (taller than wide) his head is the top 46 % of it
    let x0 = cell, x1 = -1, y0 = cell, y1 = -1;
    for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) if (px[((fy + y) * w + fx + x) * 4 + 3] > 127) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) continue;
    const from = y1 - y0 > (x1 - x0) * 1.1 ? y0 + Math.round((y1 - y0 + 1) * 0.46) : y0;
    for (let y = from; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = ((fy + y) * w + fx + x) * 4; if (px[i + 3] < 128) continue;
      const r = map.get((px[i] << 16) | (px[i + 1] << 8) | px[i + 2]);
      if (r) { px[i] = r[0]; px[i + 1] = r[1]; px[i + 2] = r[2]; }
    }
  }
  c.putImageData(img, 0, 0);
  scene.textures.addSpriteSheet(out, cv as unknown as HTMLImageElement, { frameWidth: cell, frameHeight: cell });
  return out;
}
