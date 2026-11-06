import { describe, expect, it } from 'vitest';
import { createMatch, step } from '../../src/core/match';
import { setHumanInput } from '../../src/core/control';
import { emptyInput } from '../../src/core/types';
import { MID } from '../../src/core/field';

const mk = () => {
  const m = createMatch({ ai: 'brain', skipKickoff: true, seed: 5, humans: [{ team: 0, slot: 4, humanSlot: 0, controls: 'full' }] });
  for (const p of m.players) { p.speedMult = 1; if (p.team === 1) { p.x = 900; p.speedMult = 0.001; } }
  const thor = m.players.find((p) => p.team === 0 && p.role === 'gk')!;
  Object.assign(m.ball, { x: thor.x + 4, y: thor.y, z: 0, vx: 0, vy: 0, vz: 0, state: 'held', owner: thor.id, inNet: false, scored: null });
  thor.state = 'hold'; thor.holdT = 0; thor.ai.armedAt = 0;
  return { m, thor };
};
const run = (m: ReturnType<typeof mk>['m'], n: number, f?: (i: number) => void) => { for (let i = 0; i < n; i++) { f?.(i); step(m); m.events = []; } };

describe('Thor en las manos de la familia', () => {
  it('con el balón en las manos espera a la persona (no lo suelta solo enseguida)', () => {
    const { m, thor } = mk();
    run(m, 120);   // 2 s
    expect(m.ball.owner).toBe(thor.id); expect(m.ball.state).toBe('held');
  });
  it('Tiro: lo despeja largo hacia donde apunta la palanca', () => {
    const { m, thor } = mk();
    run(m, 30);
    run(m, 3, (i) => setHumanInput(m, 0, { ...emptyInput(), mx: 1, my: 0, shoot: i === 0, shootPressed: i === 0 }));
    setHumanInput(m, 0, null);
    run(m, 40);
    expect(m.ball.owner === thor.id && m.ball.state === 'held').toBe(false);
    expect(m.ball.x - thor.x).toBeGreaterThan(60);
  });
  it('Pase: se la lanza a un compañero', () => {
    const { m, thor } = mk();
    run(m, 30);
    run(m, 3, (i) => setHumanInput(m, 0, { ...emptyInput(), mx: 1, my: (m.ball.y > MID ? -0.2 : 0.2), pass: i === 0, passPressed: i === 0 }));
    setHumanInput(m, 0, null);
    run(m, 5);
    expect(m.ball.state === 'held' && m.ball.owner === thor.id).toBe(false);
    expect(m.lastPass?.from).toBe(thor.id);
  });
  it('si nadie hace nada, a los pocos segundos la suelta solo', () => {
    const { m, thor } = mk();
    run(m, 60 * 5);
    expect(m.ball.state === 'held' && m.ball.owner === thor.id).toBe(false);
  });
});
