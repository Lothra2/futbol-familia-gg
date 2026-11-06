import { describe, it, expect } from 'vitest';
import { computeLayout } from '../../src/core/layout';

describe('layout con escala entera', () => {
  it('1280x720 usa x3 y 426x240 exactos', () => {
    const l = computeLayout(1280, 720, 1);
    expect([l.scale, l.w, l.h]).toEqual([3, 426, 240]);
  });
  it('1920x1080 usa x5 y 384x216', () => {
    const l = computeLayout(1920, 1080, 1);
    expect([l.scale, l.w, l.h]).toEqual([5, 384, 216]);
  });
  it('iPad 1024x768 a dpr 2 da x6 y 341x256 (casi la pantalla de la NES)', () => {
    const l = computeLayout(1024, 768, 2);
    expect([l.scale, l.w, l.h]).toEqual([6, 341, 256]);
  });
  it('telefono 844x390 a dpr 3 da x5 y 506x234', () => {
    const l = computeLayout(844, 390, 3);
    expect([l.scale, l.w, l.h]).toEqual([5, 506, 234]);
  });
  it('en todos los teléfonos y tablets el alto lógico queda entre 216 y 290: un jugador de 30 px se ve grande como en la NES', () => {
    for (const [w, h, d] of [[844, 390, 3], [932, 430, 3], [667, 375, 2], [1024, 768, 2], [1180, 820, 2], [1366, 1024, 2], [915, 412, 2.625], [800, 360, 3]] as const) {
      const l = computeLayout(w, h, d);
      expect(l.h).toBeGreaterThanOrEqual(216); expect(l.h).toBeLessThanOrEqual(290);
    }
  });
  it('el tamano visible en CSS es multiplo exacto del pixel de dispositivo y respeta los limites', () => {
    for (const [w, h, d] of [[1366, 768, 1], [1440, 900, 2], [800, 600, 1], [390, 844, 3], [1280, 720, 1], [2560, 1440, 1]] as const) {
      const l = computeLayout(w, h, d);
      expect(Number.isInteger(l.scale)).toBe(true);
      expect(Math.abs(l.cssW * d - l.w * l.scale)).toBeLessThan(1e-6);
      expect(l.w).toBeGreaterThanOrEqual(320);
      expect(l.h).toBeGreaterThanOrEqual(216);
      expect(l.w).toBeLessThanOrEqual(640);
      expect(l.h).toBeLessThanOrEqual(384);
    }
  });
});
