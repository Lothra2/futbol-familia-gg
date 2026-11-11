import { describe, expect, it } from 'vitest';
import { createMatch, step } from '../../src/core/match';
import { setHumanInput } from '../../src/core/control';
import { geyserState, layoutHazards, type World } from '../../src/core/hazards';
import { AREA_BIG, CENTER, PITCH } from '../../src/core/field';
import { T } from '../../src/core/tuning';
import type { Match, Player } from '../../src/core/state';
import { ball, clear, give, inp, put } from './helpers';

const WORLDS: World[] = ['volcan', 'arrecife', 'nubes', 'bosque'];
/** A person moves Sophie on the pitch of a kingdom, everybody else out of the way. */
function on(world: World, controls: 'full' | 'easy' = 'full'): { m: Match; me: Player } {
  const m = createMatch({ ai: 'none', skipKickoff: true, seed: 6, world, humans: [{ team: 0, slot: 4, humanSlot: 0, controls }] });
  for (const p of m.players) p.speedMult = 1;
  clear(m);
  const me = m.players.find((p) => p.id === m.humans[0].id)!;
  ball(m, 900, 30);
  m.humans[0].since = 1e9;   // the person keeps moving Sophie even with the ball far away
  return { m, me };
}
const run = (m: Match, n: number, f = inp(), each?: () => void): void => { for (let i = 0; i < n; i++) { setHumanInput(m, 0, f); step(m); each?.(); } };
/** Waits (with nobody on it) until the geyser is in the state wanted. */
const until = (m: Match, h: Match['hazards'][number], st: 0 | 1 | 2): void => { for (let i = 0; i < 60 * 10 && geyserState(h, m.t) !== st; i++) step(m); expect(geyserState(h, m.t)).toBe(st); };

describe('las trampas de cada cancha', () => {
  it('cada reino tiene las suyas, iguales para los dos lados, fuera de las áreas y del círculo central', () => {
    const kinds = new Set<string>();
    for (const w of WORLDS) {
      const hs = layoutHazards(w);
      expect(hs.length).toBeGreaterThanOrEqual(4); expect(new Set(hs.map((h) => h.kind)).size).toBe(1); kinds.add(hs[0].kind);
      for (const h of hs) {
        expect(hs.some((o) => Math.abs(o.x - (PITCH.w - h.x)) < 0.01 && Math.abs(o.y - (PITCH.d - h.y)) < 0.01), `${w}: gemela`).toBe(true);
        expect(h.x - h.rx).toBeGreaterThan(AREA_BIG.len + 10); expect(h.x + h.rx).toBeLessThan(PITCH.w - AREA_BIG.len - 10);
        expect(h.y - h.ry).toBeGreaterThan(8); expect(h.y + h.ry).toBeLessThan(PITCH.d - 8);
        expect(Math.hypot(h.x - CENTER.x, h.y - CENTER.y)).toBeGreaterThan(CENTER.r + h.rx);
      }
    }
    expect(kinds.size).toBe(4);
  });
  it('sin reino (las pruebas, el menú) y en el entrenamiento la cancha está limpia', () => {
    expect(createMatch({ ai: 'none' }).hazards.length).toBe(0);
    expect(createMatch({ ai: 'none', world: 'volcan', training: true }).hazards.length).toBe(0);
  });
  it('Arrecife: el que cruza un charco corriendo a fondo se resbala y suelta el balón; caminando solo se moja', () => {
    const a = on('arrecife'), h = a.m.hazards[0];
    put(a.me, h.x - 70, h.y); give(a.m, a.me);
    let slipped = false;
    run(a.m, 120, inp({ mx: 1, sprint: true }), () => { if (a.m.events.some((e) => e.k === 'slip' && e.who === a.me.id)) slipped = true; a.m.events = []; });
    expect(slipped).toBe(true); expect(a.m.ball.owner).not.toBe(a.me.id);
    const b = on('arrecife'); put(b.me, h.x - 40, h.y);
    let fell = false;
    run(b.m, 150, inp({ mx: 0.5 }), () => { if (b.me.state === 'tumble') fell = true; });
    expect(b.me.x).toBeGreaterThan(h.x + h.rx); expect(fell).toBe(false);
  });
  it('Arrecife: el balón pierde velocidad en el agua', () => {
    const roll = (world?: World): number => { const m = createMatch({ ai: 'none', skipKickoff: true, world }); clear(m); const h = layoutHazards('arrecife')[0]; ball(m, h.x - 40, h.y, 0, 200, 0); for (let i = 0; i < 60; i++) step(m); return m.ball.x; };
    expect(roll('arrecife')).toBeLessThan(roll() - 15);
  });
  it('Volcán: el géiser avisa echando humo y, cuando revienta, manda por el aire al que esté encima y al balón', () => {
    const { m, me } = on('volcan'), h = m.hazards[0];
    put(me, h.x, h.y);
    until(m, h, 1); expect(me.state).not.toBe('tumble'); expect(me.z).toBe(0);   // smoking: nothing happens yet
    let blown = false, top = 0;
    run(m, 100, inp(), () => { if (m.events.some((e) => e.k === 'geyser' && e.who === me.id)) blown = true; m.events = []; top = Math.max(top, me.z); });
    expect(blown).toBe(true); expect(top).toBeGreaterThan(25); expect(me.state).toBe('tumble');
    const b = on('volcan'), hb = b.m.hazards[0];
    until(b.m, hb, 2); ball(b.m, hb.x, hb.y); let z = 0;
    for (let i = 0; i < 40; i++) { step(b.m); z = Math.max(z, b.m.ball.z); }
    expect(z).toBeGreaterThan(40);
  });
  it('Bosque: en el barro todos van lentos, y al salir vuelven a su paso', () => {
    const { m, me } = on('bosque'), h = m.hazards[0];
    put(me, h.x - h.rx + 6, h.y);
    let vIn = 0; run(m, 40, inp({ mx: 1 }), () => { if (Math.abs(me.x - h.x) < h.rx - 6) vIn = Math.max(vIn, me.vx); });
    run(m, 120, inp({ mx: 1 }));
    expect(me.x).toBeGreaterThan(h.x + h.rx + 10);
    expect(vIn).toBeLessThan(me.stats.run * (T.haz.mud.slow + 0.08)); expect(me.vx).toBeGreaterThan(me.stats.run * 0.95); expect(me.state).not.toBe('tumble');
  });
  it('Nubes: el que pisa una nube rebota alto, con el balón si lo lleva, y arriba puede hacer la patada giratoria', () => {
    const { m, me } = on('nubes'), h = m.hazards[0];
    put(me, h.x - 40, h.y); give(m, me);
    let boing = false, top = 0;
    run(m, 70, inp({ mx: 1 }), () => { if (m.events.some((e) => e.k === 'boing' && e.who === me.id)) boing = true; m.events = []; top = Math.max(top, me.z); });
    expect(boing).toBe(true); expect(top).toBeGreaterThan(45); expect(me.state).not.toBe('tumble');
    const c = on('nubes'); put(c.me, h.x - 30, h.y); give(c.m, c.me);
    run(c.m, 200, inp({ mx: 1 }), () => { if (c.me.z > 30 && c.m.ball.owner === c.me.id && !c.me.act) { setHumanInput(c.m, 0, inp({ shoot: true, shootPressed: true })); step(c.m); } });
    expect(c.m.ball.kick?.kind).toBe('spin');
  });
  it('a una niña con controles fáciles ninguna trampa la tumba: se moja, vuela y rebota, y sigue jugando', () => {
    const a = on('arrecife', 'easy'), h = a.m.hazards[0]; put(a.me, h.x - 60, h.y);
    let fell = false, wet = false;
    run(a.m, 150, inp({ mx: 1 }), () => { if (a.me.state === 'tumble') fell = true; if (a.m.events.some((e) => e.k === 'slip')) wet = true; a.m.events = []; });
    expect(fell).toBe(false); expect(wet).toBe(true);
    const v = on('volcan', 'easy'), g = v.m.hazards[0]; put(v.me, g.x, g.y);
    let top = 0, down = false; run(v.m, 60 * 9, inp(), () => { top = Math.max(top, v.me.z); if (v.me.state === 'tumble') down = true; });
    expect(top).toBeGreaterThan(25); expect(down).toBe(false);
  });
  it('los porteros no las pisan y un partido entero con trampas termina sin trabas ni NaN', () => {
    for (const world of WORLDS) {
      const m = createMatch({ seed: 3, ai: 'brain', halfLength: 30, world });
      for (let i = 0; i < 60 * 200 && m.phase !== 'over'; i++) { step(m); m.events = []; for (const p of m.players) expect(Number.isFinite(p.x + p.y + p.z + p.vx + p.vy)).toBe(true); }
      expect(m.phase, world).toBe('over'); expect((m.data.stuck as number) ?? 0).toBeLessThan(3);
    }
  });
});
