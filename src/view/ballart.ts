/** The ball, drawn pixel by pixel from what it is doing: a real sphere with the twelve black patches of a football that roll the way the ball
 *  goes, lit from the top left with the three tones of a NES sprite and an ink rim. The same painter stretches it along a hard shot, squashes
 *  it on a bounce and gives it the shapes of the power shots of Nekketsu (the bullet, the banana, the spinning disc). Pure: no Phaser, no
 *  canvas, so the tests paint it too. */

export type Mat3 = [number, number, number, number, number, number, number, number, number];
export const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** The centres of the black patches: the twelve corners of an icosahedron. */
const PATCHES: [number, number, number][] = (() => {
  const g = (1 + Math.sqrt(5)) / 2, n = Math.hypot(1, g), out: [number, number, number][] = [];
  for (const a of [-1, 1]) for (const b of [-g, g]) { out.push([0, a / n, b / n], [a / n, b / n, 0], [b / n, 0, a / n]); }
  return out;
})();

/** The camera looks down at the pitch at about this angle from the ground, so a ball that rolls towards us turns over its top. */
const PITCH_A = 52 * Math.PI / 180;
const UP: [number, number, number] = [0, -Math.cos(PITCH_A), Math.sin(PITCH_A)];
const NEAR: [number, number, number] = [0, Math.sin(PITCH_A), Math.cos(PITCH_A)];

/** `m` turned by `ang` radians round the axis (ax, ay, az) (a unit vector), in the frame of the screen. */
export function rotate(m: Mat3, ax: number, ay: number, az: number, ang: number): Mat3 {
  const c = Math.cos(ang), s = Math.sin(ang), t = 1 - c;
  const r = [t * ax * ax + c, t * ax * ay - s * az, t * ax * az + s * ay, t * ax * ay + s * az, t * ay * ay + c, t * ay * az - s * ax, t * ax * az - s * ay, t * ay * az + s * ax, t * az * az + c];
  const o = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o[i * 3 + j] = r[i * 3] * m[j] + r[i * 3 + 1] * m[3 + j] + r[i * 3 + 2] * m[6 + j];
  return o as Mat3;
}

/** The ball after rolling (dx, dy) world px on the ground (x along the pitch, y towards the camera) with a radius of `r` px. */
export function roll(m: Mat3, dx: number, dy: number, r: number): Mat3 {
  const d = Math.hypot(dx, dy);
  if (d < 1e-4) return m;
  // the way it goes, in the frame of the screen; it turns round the axis that lies on the ground across that way
  const vx = dx / d, vy = (dy / d) * NEAR[1], vz = (dy / d) * NEAR[2];
  const ax = UP[1] * vz - UP[2] * vy, ay = UP[2] * vx, az = -UP[1] * vx, n = Math.hypot(ax, ay, az) || 1;
  return rotate(m, ax / n, ay / n, az / n, d / r);
}

/** Keeps the turning matrix square after thousands of small turns. */
export function tidy(m: Mat3): Mat3 {
  let [a, b, c, d, e, f] = m;
  const n1 = Math.hypot(a, b, c) || 1; a /= n1; b /= n1; c /= n1;
  const k = a * d + b * e + c * f; d -= k * a; e -= k * b; f -= k * c;
  const n2 = Math.hypot(d, e, f) || 1; d /= n2; e /= n2; f /= n2;
  return [a, b, c, d, e, f, b * f - c * e, c * d - a * f, a * e - b * d];
}

/** A ball with one of its patches looking at us (the picture everybody draws). */
export const FACING: Mat3 = (() => {
  // turn the first patch to the +z of the screen
  const [x, y, z] = PATCHES[0], ax = y, ay = -x, n = Math.hypot(ax, ay) || 1;
  return rotate(IDENTITY, ax / n, ay / n, 0, Math.acos(Math.max(-1, Math.min(1, z))));
})();

/** The colours of a ball: rim, the white, its shaded side, the patches (lit and in shade) and the shine. 0xRRGGBB. */
export interface BallPal { ink: number; base: number; shade: number; patch: number; patchLit: number; shine: number }
export const PAL_BALL: BallPal = { ink: 0x1a1230, base: 0xf8f6ff, shade: 0xb9b3dc, patch: 0x1a1230, patchLit: 0x3a3060, shine: 0xffffff };
export const PAL_HOT: Record<string, BallPal> = {
  fuego: { ink: 0x7a1408, base: 0xfff3b0, shade: 0xffa040, patch: 0xd8281a, patchLit: 0xff5e1a, shine: 0xffffff },
  blanco: { ink: 0xff8a2a, base: 0xffffff, shade: 0xfff3b0, patch: 0xffd447, patchLit: 0xffe45c, shine: 0xffffff },
  rayo: { ink: 0x8a6a00, base: 0xffffd8, shade: 0xffe45c, patch: 0xf0a800, patchLit: 0xffd447, shine: 0xffffff },
  agua: { ink: 0x143a8a, base: 0xe8f7ff, shade: 0x7bc8ff, patch: 0x2a6ad8, patchLit: 0x5ab4ff, shine: 0xffffff },
  oro: { ink: 0x6e4602, base: 0xfff3b0, shade: 0xf2c94c, patch: 0xb87a08, patchLit: 0xde9d02, shine: 0xffffff },
  lila: { ink: 0x4a2a8a, base: 0xfaf0ff, shade: 0xd8b8ff, patch: 0x8a5ad8, patchLit: 0xb98cff, shine: 0xffffff },
  hoja: { ink: 0x14501e, base: 0xf0ffe0, shade: 0x9be07a, patch: 0x2a9a3a, patchLit: 0x5ddb43, shine: 0xffffff },
  rosa: { ink: 0x8a1450, base: 0xfff0f6, shade: 0xffb0d0, patch: 0xe8508f, patchLit: 0xff6fb5, shine: 0xffffff },
};

/** How the ball is drawn this frame. `ux`, `uy`: the way it is stretched (a unit vector on the screen); `sx` along it and `sy` across it
 *  (1 = round); `bend` curves it into a banana (0 = none, about 0.6 = a crescent); `taper` makes a drop of it, round in front and thin behind
 *  (0 = none, about 0.6 = a comet); `lobes` and `lobe` give it points all round, like a star or a saw (how many, and how deep, 0 to about 0.4),
 *  turned by `phase` radians. */
export interface BallShape { r: number; ux?: number; uy?: number; sx?: number; sy?: number; bend?: number; taper?: number; lobes?: number; lobe?: number; phase?: number }

/** Half the angle a black patch covers on the ball. */
const PATCH_A = 0.35;
const LIGHT = ((): [number, number, number] => { const v = [-0.48, -0.62, 0.62], n = Math.hypot(v[0], v[1], v[2]); return [v[0] / n, v[1] / n, v[2] / n]; })();

/** Paints the ball in the middle of a square RGBA buffer of `size` px a side (it is cleared first). Returns how many px it covers. */
export function paintBall(buf: Uint8ClampedArray, size: number, rot: Mat3, shape: BallShape, pal: BallPal = PAL_BALL): number {
  buf.fill(0);
  const c = size / 2, r = shape.r, ux = shape.ux ?? 1, uy = shape.uy ?? 0, sx = shape.sx ?? 1, sy = shape.sy ?? 1, bend = shape.bend ?? 0;
  const taper = shape.taper ?? 0, lobes = shape.lobes ?? 0, lobe = lobes ? shape.lobe ?? 0 : 0, phase = shape.phase ?? 0;
  const vx = -uy, vy = ux, cosP = Math.cos(PATCH_A), tone = new Int8Array(size * size);
  let count = 0;
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    const dx = px + 0.5 - c, dy = py + 0.5 - c;
    const a = dx * ux + dy * uy, b0 = dx * vx + dy * vy, b = b0 - bend * ((a * a) / (r * sx) - r * sx * 0.3);
    const wide = taper ? Math.max(0.12, (1 + taper * (a / (r * sx))) / (1 + taper)) : 1;
    const qa = a / sx, qb = b / (sy * wide);
    let rr = (qa * qa + qb * qb) / (r * r);
    if (lobe) { const lim = 1 - lobe + lobe * Math.cos(lobes * Math.atan2(qb, qa) + phase); rr /= lim * lim; }
    if (rr > 1) continue;
    // the point of the sphere under this pixel, in the frame of the screen, and the same point on the leather
    const nz = Math.sqrt(1 - rr), na = qa / r, nb = qb / r;
    const nx = na * ux + nb * vx, ny = na * uy + nb * vy;
    const bx = rot[0] * nx + rot[3] * ny + rot[6] * nz, by = rot[1] * nx + rot[4] * ny + rot[7] * nz, bz = rot[2] * nx + rot[5] * ny + rot[8] * nz;
    let patch = false;
    // a patch right on the rim would melt into the ink of the outline: the ball keeps a white edge all round
    if (nz > 0.34) for (const p of PATCHES) if (bx * p[0] + by * p[1] + bz * p[2] > cosP) { patch = true; break; }
    const l = nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2];
    // 1 white, 2 shaded white, 3 patch, 4 patch in the light, 5 shine
    tone[py * size + px] = patch ? (l > 0.55 ? 4 : 3) : l > 0.93 && r >= 5 ? 5 : l < 0.22 ? 2 : 1;
    count++;
  }
  const cols = [0, pal.base, pal.shade, pal.patch, pal.patchLit, pal.shine];
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    const i = py * size + px, t = tone[i];
    if (!t) continue;
    const edge = px === 0 || py === 0 || px === size - 1 || py === size - 1 || !tone[i - 1] || !tone[i + 1] || !tone[i - size] || !tone[i + size];
    const col = edge ? pal.ink : cols[t];
    buf[i * 4] = col >> 16; buf[i * 4 + 1] = (col >> 8) & 255; buf[i * 4 + 2] = col & 255; buf[i * 4 + 3] = 255;
  }
  return count;
}

/** A tail of fire behind the ball, painted under it (call before paintBall on the same buffer is not possible: this one adds to what is
 *  there without clearing, so paint the ball first and the fire fills only the empty px). `ux`, `uy` is the way the ball goes. */
export function paintFlame(buf: Uint8ClampedArray, size: number, r: number, ux: number, uy: number, t: number, len: number, cols: [number, number, number] = [0xfff3b0, 0xffa040, 0xe0301a]): void {
  const c = size / 2, vx = -uy, vy = ux;
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    const i = (py * size + px) * 4;
    if (buf[i + 3]) continue;
    const dx = px + 0.5 - c, dy = py + 0.5 - c, a = -(dx * ux + dy * uy), b = dx * vx + dy * vy;
    if (a < -r * 0.6 || a > len) continue;
    const u = Math.max(0, a) / len;
    // the tongues of the flame: the width falls to nothing at the tip and flickers
    const w = (r + 1.5) * (1 - u * u) * (0.82 + 0.3 * Math.sin(t * 34 + a * 0.75) * u + 0.18 * Math.sin(t * 21 - a * 1.4 + b));
    const k = Math.abs(b) / Math.max(0.5, w);
    if (k > 1) continue;
    const col = k < 0.38 && u < 0.55 ? cols[0] : k < 0.72 && u < 0.85 ? cols[1] : cols[2];
    buf[i] = col >> 16; buf[i + 1] = (col >> 8) & 255; buf[i + 2] = col & 255; buf[i + 3] = 255;
  }
}
