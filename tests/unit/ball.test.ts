import { describe, expect, it } from 'vitest';
import { lobLaunch, speedToReach } from '../../src/core/ball';
import { PITCH } from '../../src/core/field';
import { clear, ball, mk, secs, ticks } from './helpers';
import { step } from '../../src/core/match';
import { DT } from '../../src/core/step';

describe('balón', () => {
  it('B1: a 230 px/s rueda 2,0 ± 0,1 s y recorre 166 ± 8 px', () => {
    const m = mk(); clear(m); ball(m, 100, 80, 0, 230, 0, 0);
    let t = 0;
    while ((Math.hypot(m.ball.vx, m.ball.vy) > 0.5) && t < 5) { step(m); t += DT; }
    expect(t).toBeGreaterThan(1.9); expect(t).toBeLessThan(2.1);
    expect(m.ball.x - 100).toBeGreaterThan(158); expect(m.ball.x - 100).toBeLessThan(174);
  });

  it('B2: speedToReach(200, 70) llega a 200 ± 4 px con 70 ± 8 px/s', () => {
    const m = mk(); clear(m); ball(m, 100, 80, 0, speedToReach(200, 70), 0, 0);
    let guard = 0;
    while (Math.hypot(m.ball.vx, m.ball.vy) > 70 && guard++ < 600) step(m);
    expect(Math.abs(m.ball.x - 100 - 200)).toBeLessThan(4);
    expect(Math.abs(Math.hypot(m.ball.vx, m.ball.vy) - 70)).toBeLessThan(8);
  });

  it('B3: un globo a 250 px cae a ± 10 px del objetivo', () => {
    for (const d of [120, 180, 250, 320]) {
      const m = mk(); clear(m); const l = lobLaunch(d);
      ball(m, 100, 80, 0, l.v, 0, l.vz);
      let landX = NaN;
      for (let g = 0; g < 600 && Number.isNaN(landX); g++) { step(m); const e = m.events.find((q) => q.k === 'bounce'); if (e) landX = e.x; }
      expect(Math.abs(landX - 100 - d), `d=${d}`).toBeLessThan(10);
    }
  });

  it('B4: el rebote baja vz al 55 % y con vz < 50 deja de rebotar y rueda', () => {
    const m = mk(); clear(m); ball(m, 400, 80, 0.5, 100, 0, -300);
    let apex = 0;
    for (let g = 0; g < 60; g++) { step(m); apex = Math.max(apex, m.ball.z); }
    // vz after the bounce is about 0.55 * 304 = 167 px/s, so the ball rises 167^2 / (2 * 520) = 26.8 px
    expect(apex).toBeGreaterThan(24); expect(apex).toBeLessThan(29);
    const m2 = mk(); clear(m2); ball(m2, 400, 80, 0.5, 100, 0, -80);
    step(m2);
    expect(m2.ball.vz).toBe(0); expect(m2.ball.z).toBe(0);
    secs(m2, 0.5); expect(m2.ball.z).toBe(0);
  });

  it('el efecto curva el balón hacia su lado y se apaga con el tiempo', () => {
    const m = mk(); clear(m); ball(m, 100, 80, 0, 300, 0, 0); m.ball.spin = 0.6;
    secs(m, 0.6);
    expect(m.ball.y).toBeGreaterThan(80 + 10);
    const m2 = mk(); clear(m2); ball(m2, 100, 80, 0, 300, 0, 0); m2.ball.spin = -0.6;
    secs(m2, 0.6); expect(m2.ball.y).toBeLessThan(80 - 10);
  });

  it('B5: los palos y el travesaño rebotan con restitución 0,7 y nada los atraviesa (200 ángulos a 600 px/s)', () => {
    for (const [x0, py] of [[0, 56], [0, 104], [PITCH.w, 56], [PITCH.w, 104]] as const) {
      let worst = 99;
      for (let i = 0; i < 200; i++) {
        const th = (i / 200) * Math.PI * 2, off = ((i % 9) - 4) * 0.9;
        const m = mk(); clear(m);
        const ux = Math.cos(th), uy = Math.sin(th);
        ball(m, x0 + ux * 60 - uy * off, py + uy * 60 + ux * off, 5, -ux * 600, -uy * 600, 0);
        m.ball.vz = 0;
        for (let k = 0; k < 40; k++) {
          step(m);
          worst = Math.min(worst, Math.hypot(m.ball.x - x0, m.ball.y - py));
          if (m.phase !== 'play') break;
        }
      }
      expect(worst, `poste ${x0},${py}`).toBeGreaterThan(4.4);
    }
    // crossbar, in the x-z plane
    let worst = 99;
    for (let i = 0; i < 200; i++) {
      const th = (i / 200) * Math.PI * 2, off = ((i % 9) - 4) * 0.9;
      const m = mk(); clear(m);
      const ux = Math.cos(th), uz = Math.sin(th);
      if (28 + uz * 60 < 0) continue;
      ball(m, 0 + ux * 60 - uz * off, 80, 28 + uz * 60 + ux * off, -ux * 600, 0, -uz * 600);
      for (let k = 0; k < 40; k++) { step(m); worst = Math.min(worst, Math.hypot(m.ball.x - 0, m.ball.z - 28)); if (m.phase !== 'play') break; }
    }
    expect(worst).toBeGreaterThan(4.4);
  });

  it('B5: un rebote en el palo conserva el 70 % de la velocidad normal', () => {
    const m = mk(); clear(m);
    ball(m, 30, 56, 5, -300, 0, 0);   // straight into the post at (0, 56)
    let before = 0;
    for (let k = 0; k < 20; k++) { if (m.ball.vx < 0) before = Math.abs(m.ball.vx); step(m); if (m.ball.vx > 0) break; }
    expect(m.ball.vx).toBeGreaterThan(0);
    expect(m.ball.vx / before).toBeGreaterThan(0.6); expect(m.ball.vx / before).toBeLessThan(0.8);
  });
  it('la red frena el balón y lo deja dentro del arco', () => {
    const m = mk(); clear(m); ball(m, 20, 80, 5, -560, 0, 0);
    ticks(m, 30);
    expect(m.ball.x).toBeLessThan(0); expect(m.ball.x).toBeGreaterThanOrEqual(-16);
    expect(Math.hypot(m.ball.vx, m.ball.vy)).toBeLessThan(5);
  });
});
