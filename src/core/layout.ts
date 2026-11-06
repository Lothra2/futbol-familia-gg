/** Integer-scale layout. Pure, so it can be unit tested. See ART_BIBLE section 2.
 *  The smallest logical screen is close to the NES one (256 x 224): with the biggest whole scale that keeps at least 320 x 216 logical pixels a
 *  footballer of 30 px fills an eighth of the height on every phone and tablet, as big and chunky as in Nintendo World Cup. */
export const MIN_W = 320;
export const MIN_H = 216;
export const MAX_W = 640;
export const MAX_H = 384;

export interface Layout {
  scale: number; // device pixels per logical pixel (integer, at least 1)
  w: number; // logical width
  h: number; // logical height
  cssW: number; // canvas CSS width
  cssH: number;
}

export function computeLayout(innerW: number, innerH: number, dpr: number): Layout {
  const devW = Math.max(1, Math.floor(innerW * dpr));
  const devH = Math.max(1, Math.floor(innerH * dpr));
  const scale = Math.max(1, Math.min(Math.floor(devW / MIN_W), Math.floor(devH / MIN_H)));
  const w = Math.min(Math.max(Math.floor(devW / scale), MIN_W), MAX_W);
  const h = Math.min(Math.max(Math.floor(devH / scale), MIN_H), MAX_H);
  return { scale, w, h, cssW: (w * scale) / dpr, cssH: (h * scale) / dpr };
}
