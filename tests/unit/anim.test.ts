import { describe, expect, it } from 'vitest';
import { LOCOMOTION, LoopClock, type AnimMeta } from '../../src/view/anim';
import { Rng } from '../../src/core/rng';

const anims: Record<string, AnimMeta> = {
  idle: { start: 14, frames: 2, fps: 3, loop: true },
  walk: { start: 8, frames: 6, fps: 10, loop: true },
  run: { start: 0, frames: 8, fps: 14, loop: true },
  swim: { start: 32, frames: 4, fps: 8, loop: true },
};

/** Frames played by a clock whose pace follows `ratio(t)`, sampled at `hz`. */
function play(name: string, seconds: number, hz: number, ratio: (t: number) => number, hitch?: (i: number) => number): number[] {
  const c = new LoopClock(); const out: number[] = [];
  for (let i = 0, t = 0; t < seconds; i++) {
    const dt = hitch ? hitch(i) : 1 / hz;
    c.ease(ratio(t), dt); out.push(c.frame(anims, name, dt)); t += dt;
  }
  return out;
}
const steps = (f: number[], frames: number): number[] => f.slice(1).map((v, i) => (v - f[i] + frames) % frames);

describe('animación en bucle', () => {
  it('no salta ni retrocede nunca: solo mantiene el cuadro o pasa al siguiente (5 minutos con velocidad que cambia sin parar)', () => {
    const r = new Rng(7); let k = 1;
    const f = play('run', 300, 60, () => { k = Math.max(0.7, Math.min(1.25, k + r.range(-0.08, 0.08))); return k; });
    const s = steps(f, 8);
    expect(s.filter((d) => d > 1)).toEqual([]);
    expect(new Set(s)).toEqual(new Set([0, 1]));
  });

  it('el código anterior (tiempo total × razón de velocidad) sí saltaba: así se midió el defecto', () => {
    const r = new Rng(7); let k = 1, total = 0, prev = 0, jumps = 0;
    for (let i = 0; i < 60 * 60; i++) {
      total += 1 / 60; k = Math.max(0.7, Math.min(1.25, k + r.range(-0.08, 0.08)));
      const f = Math.floor(total * k * 14) % 8;
      if (i > 0 && (f - prev + 8) % 8 > 1) jumps++;
      prev = f;
    }
    expect(jumps).toBeGreaterThan(500);   // un minuto de carrera: cientos de saltos al azar
  });

  it('con un tirón largo (200 ms) avanza como mucho una pose: ninguna se pierde', () => {
    const f = play('run', 20, 60, () => 1.25, (i) => (i % 40 === 0 ? 0.2 : 1 / 60));
    expect(steps(f, 8).filter((d) => d > 1)).toEqual([]);
  });

  it('a 30, 60 y 120 Hz muestra las 8 poses de la carrera y el ritmo es el de la hoja (14 cuadros por segundo)', () => {
    for (const hz of [30, 60, 120]) {
      const f = play('run', 10, hz, () => 1);
      expect(new Set(f).size, `${hz} Hz`).toBe(8);
      const advances = steps(f, 8).filter((d) => d === 1).length;
      expect(advances / 10, `${hz} Hz`).toBeGreaterThan(13.5);
      expect(advances / 10, `${hz} Hz`).toBeLessThan(14.5);
    }
  });

  it('el ritmo sigue a la velocidad sin brincos: la mitad de velocidad, la mitad de cuadros por segundo', () => {
    const half = steps(play('run', 10, 60, () => 0.5), 8).filter((d) => d === 1).length / 10;
    expect(half).toBeGreaterThan(6.5); expect(half).toBeLessThan(7.5);
  });

  it('caminar y correr comparten el ciclo de piernas, el resto lo reinicia', () => {
    const c = new LoopClock();
    for (let i = 0; i < 20; i++) c.frame(anims, 'walk', 1 / 60);
    const before = c.cycle;
    c.frame(anims, 'run', 0);   // same instant, different animation
    expect(c.cycle).toBeCloseTo(before, 6);
    c.frame(anims, 'swim', 0);
    expect(c.cycle).toBe(0);
    expect(LOCOMOTION.has('walk') && LOCOMOTION.has('run') && LOCOMOTION.has('zoomies') && !LOCOMOTION.has('swim')).toBe(true);
  });

  it('una animación que no existe usa idle y una de un solo cuadro no se mueve', () => {
    const c = new LoopClock();
    expect(c.frame(anims, 'no_existe', 1)).toBeGreaterThanOrEqual(14);
    const one: Record<string, AnimMeta> = { idle: { start: 3, frames: 1, fps: 0, loop: true } };
    expect(new LoopClock().frame(one, 'idle', 5)).toBe(3);
  });

  it('en pausa (dt = 0) nada cambia', () => {
    const c = new LoopClock(); for (let i = 0; i < 30; i++) c.frame(anims, 'run', 1 / 60);
    const a = c.frame(anims, 'run', 0), b = c.frame(anims, 'run', 0);
    expect(a).toBe(b);
  });
});
