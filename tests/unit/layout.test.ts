import { describe, it, expect } from 'vitest';
import { computeLayout } from '../../src/core/layout';

describe('layout con escala entera', () => {
  it('1280x720 usa x3 y 426x240 exactos', () => {
    const l = computeLayout(1280, 720, 1);
    expect([l.scale, l.w, l.h]).toEqual([3, 426, 240]);
  });
  it('1920x1080 usa x4 y 480x270', () => {
    const l = computeLayout(1920, 1080, 1);
    expect([l.scale, l.w, l.h]).toEqual([4, 480, 270]);
  });
  it('iPad 1024x768 a dpr 2 da x4 y 512x384', () => {
    const l = computeLayout(1024, 768, 2);
    expect([l.scale, l.w, l.h]).toEqual([4, 512, 384]);
  });
  it('telefono 844x390 a dpr 3 da x4 y 633x292', () => {
    const l = computeLayout(844, 390, 3);
    expect([l.scale, l.w, l.h]).toEqual([4, 633, 292]);
  });
  it('el tamano visible en CSS es multiplo exacto del pixel de dispositivo y respeta los limites', () => {
    for (const [w, h, d] of [[1366, 768, 1], [1440, 900, 2], [800, 600, 1], [390, 844, 3], [1280, 720, 1], [2560, 1440, 1]] as const) {
      const l = computeLayout(w, h, d);
      expect(Number.isInteger(l.scale)).toBe(true);
      expect(Math.abs(l.cssW * d - l.w * l.scale)).toBeLessThan(1e-6);
      expect(l.w).toBeGreaterThanOrEqual(426);
      expect(l.h).toBeGreaterThanOrEqual(240);
      expect(l.w).toBeLessThanOrEqual(640);
      expect(l.h).toBeLessThanOrEqual(384);
    }
  });
});
