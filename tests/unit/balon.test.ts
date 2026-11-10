import { describe, expect, it } from 'vitest';
import { FACING, IDENTITY, PAL_BALL, paintBall, paintFlame, roll, rotate, tidy, type Mat3 } from '../../src/view/ballart';
import { KICK_MOVE, MOVES, lookOf, lookOfPower, moveOfPower } from '../../src/view/ballmoves';
import { KIND_INDEX } from '../../src/core/specials';

const SIZE = 64;
const paint = (rot: Mat3, shape: Parameters<typeof paintBall>[3], pal = PAL_BALL): { buf: Uint8ClampedArray; n: number } => { const buf = new Uint8ClampedArray(SIZE * SIZE * 4); return { buf, n: paintBall(buf, SIZE, rot, shape, pal) }; };
const rgb = (b: Uint8ClampedArray, i: number): number => (b[i * 4] << 16) | (b[i * 4 + 1] << 8) | b[i * 4 + 2];
/** The box of what is painted: x0, y0, x1, y1. */
function box(b: Uint8ClampedArray): [number, number, number, number] {
  let x0 = SIZE, y0 = SIZE, x1 = -1, y1 = -1;
  for (let i = 0; i < SIZE * SIZE; i++) if (b[i * 4 + 3]) { const x = i % SIZE, y = Math.floor(i / SIZE); x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return [x0, y0, x1, y1];
}

describe('el balón pintado', () => {
  it('es un balón de fútbol: redondo, del tamaño pedido, con borde de tinta, blanco y parches negros', () => {
    const { buf, n } = paint(FACING, { r: 9 });
    const [x0, y0, x1, y1] = box(buf);
    expect(x1 - x0 + 1).toBe(18); expect(y1 - y0 + 1).toBe(18);
    expect(n).toBeGreaterThan(Math.PI * 81 * 0.9); expect(n).toBeLessThan(Math.PI * 81 * 1.1);
    const cols = new Map<number, number>();
    for (let i = 0; i < SIZE * SIZE; i++) if (buf[i * 4 + 3]) cols.set(rgb(buf, i), (cols.get(rgb(buf, i)) ?? 0) + 1);
    expect(cols.get(PAL_BALL.base)).toBeGreaterThan(60);    // plenty of white
    expect(cols.get(PAL_BALL.shade)).toBeGreaterThan(10);   // a shaded side
    expect((cols.get(PAL_BALL.patch) ?? 0) + (cols.get(PAL_BALL.patchLit) ?? 0)).toBeGreaterThan(40);   // ink rim and patches
    // the patch that looks at us is in the middle
    expect([PAL_BALL.patch, PAL_BALL.patchLit]).toContain(rgb(buf, 32 * SIZE + 32));
    // every px of the rim is ink
    for (let x = x0; x <= x1; x++) for (const y of [y0, y1]) if (buf[(y * SIZE + x) * 4 + 3]) expect(rgb(buf, y * SIZE + x)).toBe(PAL_BALL.ink);
  });
  it('rueda hacia donde va: el dibujo cambia, y una vuelta entera lo deja como estaba', () => {
    const a = paint(FACING, { r: 9 }).buf;
    const m1 = roll(FACING, 6, 0, 9);
    expect(Array.from(paint(m1, { r: 9 }).buf)).not.toEqual(Array.from(a));
    let m = FACING;
    for (let i = 0; i < 100; i++) m = roll(m, (2 * Math.PI * 9) / 100, 0, 9);
    expect(Array.from(paint(tidy(m), { r: 9 }).buf)).toEqual(Array.from(a));
    // rolling towards the camera and rolling sideways are different turns
    expect(roll(FACING, 0, 6, 9)).not.toEqual(roll(FACING, 6, 0, 9));
  });
  it('tidy deja la matriz de giro cuadrada después de miles de giros', () => {
    let m: Mat3 = rotate(IDENTITY, 0, 0, 1, 0.3);
    for (let i = 0; i < 5000; i++) m = roll(m, 1.7, 0.9, 9);
    m = tidy(m);
    for (const r of [0, 3, 6]) expect(Math.hypot(m[r], m[r + 1], m[r + 2])).toBeCloseTo(1, 9);
    expect(m[0] * m[3] + m[1] * m[4] + m[2] * m[5]).toBeCloseTo(0, 9);
  });
  it('se estira a lo largo de su camino y se aplasta de través', () => {
    const [x0, y0, x1, y1] = box(paint(FACING, { r: 9, sx: 1.5, sy: 0.8 }).buf);
    expect(x1 - x0).toBeGreaterThan(24); expect(y1 - y0).toBeLessThan(16);
    const [u0, v0, u1, v1] = box(paint(FACING, { r: 9, ux: 0, uy: 1, sx: 1.5, sy: 0.8 }).buf);
    expect(v1 - v0).toBeGreaterThan(24); expect(u1 - u0).toBeLessThan(16);
  });
  it('la estrella tiene puntas y la gota es más ancha adelante que atrás', () => {
    const star = paint(FACING, { r: 11, lobes: 5, lobe: 0.24 }), round = paint(FACING, { r: 11 });
    expect(star.n).toBeLessThan(round.n * 0.8);
    const drop = paint(FACING, { r: 9, sx: 1.5, sy: 0.9, taper: 0.5 }).buf;
    const width = (x: number): number => { let n = 0; for (let y = 0; y < SIZE; y++) if (drop[(y * SIZE + x) * 4 + 3]) n++; return n; };
    expect(width(32 + 8)).toBeGreaterThan(width(32 - 8) + 3);
  });
  it('el fuego solo llena lo que el balón dejó vacío, detrás de él', () => {
    const { buf } = paint(FACING, { r: 11 });
    const before = Array.from(buf);
    paintFlame(buf, SIZE, 11, 1, 0, 0.2, 24);
    let added = 0, ahead = 0;
    for (let i = 0; i < SIZE * SIZE; i++) { if (before[i * 4 + 3]) expect(rgb(buf, i)).toBe((before[i * 4] << 16) | (before[i * 4 + 1] << 8) | before[i * 4 + 2]); else if (buf[i * 4 + 3]) { added++; if (i % SIZE > 44) ahead++; } }
    expect(added).toBeGreaterThan(60); expect(ahead).toBe(0);
  });
});

describe('el set de movimientos del balón', () => {
  it('cada movimiento, a cualquier hora y hacia cualquier lado, cabe entero en su cuadro (nada cortado)', () => {
    for (const move of MOVES) for (const t of [0, 0.07, 0.31, 0.52, 1.13]) for (const [ux, uy] of [[1, 0], [0.7071, 0.7071], [0, -1], [-0.8, 0.6]]) for (const r of [9, 12]) {
      const look = lookOf(move, r, ux, uy, t, t);
      const buf = paint(FACING, look.shape, look.pals[0]).buf;
      if (look.flame) paintFlame(buf, SIZE, look.shape.r, ux, uy, t, look.flame);
      const [x0, y0, x1, y1] = box(buf);
      expect(x1, `${move} t=${t}`).toBeGreaterThan(-1);
      expect(x0, `${move} t=${t} r=${r}`).toBeGreaterThan(0); expect(y0, `${move} t=${t} r=${r}`).toBeGreaterThan(0);
      expect(x1, `${move} t=${t} r=${r}`).toBeLessThan(SIZE - 1); expect(y1, `${move} t=${t} r=${r}`).toBeLessThan(SIZE - 1);
    }
  });
  it('cada poder tiene su forma, y no hay dos poderes con el mismo balón', () => {
    const seen = new Set<string>();
    for (const kind of KIND_INDEX) {
      const move = moveOfPower(kind, 0.5, false);
      expect(MOVES).toContain(move); expect(move).not.toBe('redondo');
      expect(seen.has(move), `${kind}: ${move}`).toBe(false); seen.add(move);
      const look = lookOfPower(kind, 9, 1, 0, 0.5, 0.5, false);
      expect(look.pals.length).toBeGreaterThan(0);
    }
  });
  it('los poderes cambian de forma en el vuelo: el cañonazo se hincha y sale como bala, las estrellas se abren en tres, la picada baja como aguja', () => {
    expect(moveOfPower('canonazo', 0.05, false)).toBe('gigante'); expect(moveOfPower('canonazo', 0.4, false)).toBe('bala');
    expect(lookOfPower('estrellas', 9, 1, 0, 0.05, 0.05, false).twins).toBeFalsy(); expect(lookOfPower('estrellas', 9, 1, 0, 0.5, 0.5, false).twins).toBe(true);
    expect(moveOfPower('picada', 0.4, false)).toBe('bumeran'); expect(moveOfPower('picada', 1.2, true)).toBe('aguja');
  });
  it('las patadas del partido también cambian el balón: giratoria, bolea, chilena y cabezazo', () => {
    expect(KICK_MOVE.spin.move).toBe('taladro'); expect(KICK_MOVE.volley.move).toBe('gota'); expect(KICK_MOVE.chilena.move).toBe('disco'); expect(KICK_MOVE.header.move).toBe('tortilla');
    // the banana bends the way it curves
    expect(lookOf('banana', 9, 1, 0, 0, 0, 1).shape.bend).toBeGreaterThan(0); expect(lookOf('banana', 9, 1, 0, 0, 0, -1).shape.bend).toBeLessThan(0);
  });
});
