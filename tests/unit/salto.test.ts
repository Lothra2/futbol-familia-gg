import { describe, expect, it } from 'vitest';
import { createMatch, step } from '../../src/core/match';
import { setHumanInput } from '../../src/core/control';
import { aerialZone, airZone } from '../../src/core/actions';
import { MID } from '../../src/core/field';
import { T } from '../../src/core/tuning';
import type { Match, Player } from '../../src/core/state';
import { ball, clear, give, inp, put } from './helpers';

/** A match where a person moves Sophie, alone in the middle of the pitch. */
function solo(): { m: Match; me: Player } {
  const m = createMatch({ ai: 'none', skipKickoff: true, seed: 3, humans: [{ team: 0, slot: 4, humanSlot: 0, controls: 'full' }] });
  for (const p of m.players) p.speedMult = 1;
  clear(m);
  const me = m.players.find((p) => p.id === m.humans[0].id)!;
  put(me, 600, MID); me.facing = 1; me.dirX = 1; me.dirY = 0;
  return { m, me };
}
const tick = (m: Match, f = inp()): void => { setHumanInput(m, 0, f); step(m); };

describe('el salto de Nekketsu', () => {
  it('Salto levanta al jugador, baja en algo más de medio segundo y en el suelo espera un momento antes del otro', () => {
    const { m, me } = solo(); ball(m, 100, 20);
    tick(m, inp({ jump: true, jumpPressed: true }));
    expect(me.z).toBeGreaterThan(0); expect(me.state).toBe('jump');
    expect(m.events.some((e) => e.k === 'jump')).toBe(true);
    let top = 0, n = 0;
    while (me.z > 0 && n < 120) { tick(m, inp({ jump: true, jumpPressed: true })); top = Math.max(top, me.z); n++; }   // hammering the button in the air does nothing
    expect(top).toBeGreaterThan(26); expect(top).toBeLessThan(40);
    expect(n / 60).toBeGreaterThan(0.45); expect(n / 60).toBeLessThan(0.75);
    tick(m, inp({ jumpPressed: true })); expect(me.z).toBe(0);   // too soon
    for (let i = 0; i < 20; i++) tick(m);
    tick(m, inp({ jumpPressed: true })); expect(me.z).toBeGreaterThan(0);
  });
  it('Tiro y Pase a la vez también saltan (A + B del NES), y el portero no salta', () => {
    const { m, me } = solo(); ball(m, 100, 20);
    tick(m, inp({ shoot: true, shootPressed: true, pass: true, passPressed: true }));
    expect(me.z).toBeGreaterThan(0); expect(me.act).toBeNull();
    const gk = m.players.find((p) => p.team === 0 && p.role === 'gk')!;
    gk.input = inp({ jumpPressed: true }); step(m);
    expect(gk.z).toBe(0);
  });
  it('con el balón salta con él, y en el aire nadie lo barre ni lo choca', () => {
    const { m, me } = solo(); give(m, me);
    tick(m, inp({ jumpPressed: true }));
    for (let i = 0; i < 12; i++) { tick(m); }
    expect(m.ball.owner).toBe(me.id); expect(m.ball.z).toBeCloseTo(me.z, 5); expect(me.z).toBeGreaterThan(12);
  });
  it('la patada giratoria: Tiro en el aire con el balón sale más fuerte que un tiro del suelo y cuenta como tiro', () => {
    const { m, me } = solo(); give(m, me);
    tick(m, inp({ jumpPressed: true }));
    for (let i = 0; i < 8; i++) tick(m);
    const shots = me.stats2.shots;
    tick(m, inp({ shoot: true, shootPressed: true }));
    expect(me.state).toBe('kick'); expect(me.act?.sub).toBe('spin');
    let v = 0, spun = false, zAt = -1;
    for (let i = 0; i < 30; i++) { tick(m); if (m.events.some((e) => e.k === 'spinkick')) { spun = true; zAt = me.z; } m.events = []; v = Math.max(v, Math.hypot(m.ball.vx, m.ball.vy)); }
    expect(spun).toBe(true);
    expect(zAt).toBeGreaterThan(8);   // he strikes it still in the air
    expect(v).toBeGreaterThan(T.shotNormal.v * me.stats.power + 40);
    expect(m.ball.kick?.kind).toBe('spin');
    expect(me.stats2.shots).toBe(shots + 1);
    expect(m.ball.vx).toBeGreaterThan(0);
  });
  it('un balón demasiado alto para cabecear desde el suelo se alcanza saltando: Tiro lo cabecea al arco', () => {
    const { m, me } = solo();
    ball(m, me.x + 4, me.y, 74, 0, 0, 0);
    expect(aerialZone(m, me)).toBeNull();
    tick(m, inp({ jumpPressed: true }));
    let headed = false;
    for (let i = 0; i < 40 && !headed; i++) {
      if (airZone(m, me) === 'header') { tick(m, inp({ shoot: true, shootPressed: true })); expect(me.act?.sub).toBe('header'); headed = true; }
      else tick(m);
    }
    expect(headed).toBe(true);
    for (let i = 0; i < 12; i++) tick(m);
    expect(m.ball.vx).toBeGreaterThan(150); expect(m.ball.kick?.kind).toBe('header');
  });
  it('baja de pecho en el aire un balón que le pasa por encima', () => {
    const { m, me } = solo();
    ball(m, me.x + 2, me.y, 34, 0, 0, 0);
    tick(m, inp({ jumpPressed: true }));
    for (let i = 0; i < 30 && m.ball.owner !== me.id; i++) tick(m);
    expect(m.ball.owner).toBe(me.id);
  });
  it('la patada voladora: Tiro en el aire sin balón tumba al rival que encuentra por delante', () => {
    const { m, me } = solo(); ball(m, 100, 20);
    const o = m.players.find((p) => p.team === 1 && p.role !== 'gk')!;
    put(o, me.x + 34, me.y);
    for (let i = 0; i < 6; i++) tick(m, inp({ mx: 1 }));
    tick(m, inp({ mx: 1, jumpPressed: true }));
    for (let i = 0; i < 6; i++) tick(m, inp({ mx: 1 }));
    tick(m, inp({ mx: 1, shoot: true, shootPressed: true }));
    expect(me.act?.kind).toBe('hit'); expect(me.act?.air).toBe(true);
    let down = false;
    for (let i = 0; i < 30; i++) { tick(m, inp({ mx: 1 })); if (o.state === 'tumble') down = true; }
    expect(down).toBe(true);
    expect(me.act).toBeNull(); expect(me.z).toBe(0);
  });
  it('la patada voladora que no encuentra a nadie termina al caer, sin castigo', () => {
    const { m, me } = solo(); ball(m, 100, 20);
    tick(m, inp({ jumpPressed: true }));
    for (let i = 0; i < 6; i++) tick(m);
    tick(m, inp({ shoot: true, shootPressed: true }));
    for (let i = 0; i < 45; i++) tick(m);
    expect(me.act).toBeNull(); expect(me.state).toBe('idle');
  });
  it('los controles fáciles no cambian: una niña no salta', () => {
    const m = createMatch({ ai: 'none', skipKickoff: true, seed: 3, humans: [{ team: 0, slot: 4, humanSlot: 0, controls: 'easy' }] });
    clear(m); const me = m.players.find((p) => p.id === m.humans[0].id)!; put(me, 600, MID); ball(m, 100, 20);
    tick(m, inp({ jumpPressed: true }));
    expect(me.z).toBe(0);
  });
  it('la IA también salta: en varios partidos hay saltos y patadas giratorias', () => {
    let jumps = 0, spins = 0;
    for (const seed of [2, 5, 9, 11, 14, 17]) {
      const m = createMatch({ seed, ai: 'brain', halfLength: 45 });
      for (let i = 0; i < 60 * 100 && m.phase !== 'over'; i++) { step(m); for (const e of m.events) { if (e.k === 'jump') jumps++; if (e.k === 'spinkick') spins++; } m.events = []; }
    }
    expect(jumps).toBeGreaterThan(2); expect(spins).toBeGreaterThan(0);
  });
});
