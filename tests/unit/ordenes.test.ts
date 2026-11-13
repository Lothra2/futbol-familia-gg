import { describe, expect, it } from 'vitest';
import { createMatch, step } from '../../src/core/match';
import { setHumanInput } from '../../src/core/control';
import { MID, PITCH } from '../../src/core/field';
import { T } from '../../src/core/tuning';
import type { Match, Player } from '../../src/core/state';
import { ball, clear, fam, give, inp, put, rival } from './helpers';

/** A person on Sophie (the captain when `fixed`), the mates and rivals driven by the AI. */
function mk(fixed: boolean, seed = 3): { m: Match; me: Player } {
  const m = createMatch({ ai: 'brain', skipKickoff: true, seed, humans: [{ team: 0, slot: 4, humanSlot: 0, controls: 'full', fixed }] });
  for (const p of m.players) p.speedMult = 1;
  clear(m, m.players.filter((p) => p.role === 'gk'));
  const me = m.players.find((p) => p.id === m.humans[0].id)!;
  return { m, me };
}
const tick = (m: Match, f = inp()): void => { setHumanInput(m, 0, f); step(m); };
const who = (m: Match): Player => m.players.find((p) => p.id === m.humans[0].id)!;
const orders = (m: Match): number[] => m.events.filter((e) => e.k === 'order').map((e) => e.v!);

describe('el capitán (Nekketsu): siempre el mismo jugador', () => {
  it('no cambia de jugador ni cuando un compañero lleva el balón, ni con el balón suelto cerca de otro, ni al recibir un pase otro', () => {
    const { m, me } = mk(true); const papa = fam(m, 'papa');
    put(me, 300, MID); put(papa, 600, MID); give(m, papa);
    for (let i = 0; i < 60; i++) tick(m);
    expect(who(m)).toBe(me); expect(papa.control).toBe('ai');
    ball(m, papa.x + 20, papa.y);
    for (let i = 0; i < 60; i++) tick(m);
    expect(who(m)).toBe(me);
  });
  it('sin capitán el control sigue al balón como siempre', () => {
    const { m, me } = mk(false); const papa = fam(m, 'papa');
    put(me, 300, MID); put(papa, 600, MID); give(m, papa);
    tick(m); expect(who(m)).toBe(papa);
  });
});

describe('órdenes a los compañeros (Nintendo World Cup)', () => {
  it('¡Pásala!: con un compañero en el balón, Pase hace que me la pase al instante, y yo no hago nada con ese toque', () => {
    const { m, me } = mk(true); const papa = fam(m, 'papa');
    put(me, 620, MID + 60); put(papa, 480, MID - 40); give(m, papa); tick(m); m.events = [];
    tick(m, inp({ passPressed: true, pass: true }));
    expect(orders(m)).toEqual([0]); expect(me.act).toBeNull(); expect(me.state).not.toBe('slide');
    let passed = -1, got = -1;
    for (let i = 0; i < 180 && got < 0; i++) { tick(m); if (passed < 0 && m.ball.state === 'free' && m.ball.lastTouch.player === papa.id) passed = i; if (m.ball.owner === me.id) got = i; }
    expect(passed).toBeGreaterThanOrEqual(0); expect(passed).toBeLessThan(30);     // he obeys in under half a second
    expect(got).toBeGreaterThan(0); expect(m.lastPass?.to).toBe(me.id);
  });
  it('de lejos me la manda por arriba', () => {
    const { m, me } = mk(true); const papa = fam(m, 'papa');
    put(me, 760, MID + 100); put(papa, 420, MID - 60); give(m, papa); tick(m);
    tick(m, inp({ passPressed: true, pass: true }));
    let top = 0; for (let i = 0; i < 120; i++) { tick(m); if (m.ball.state === 'free' && m.ball.lastTouch.player === papa.id) top = Math.max(top, m.ball.z); }
    expect(top).toBeGreaterThan(20);
  });
  it('¡Tira!: Tiro hace que el compañero dispare al arco ya', () => {
    const { m, me } = mk(true); const papa = fam(m, 'papa');
    put(me, 500, MID + 120); put(papa, PITCH.w - 240, MID); give(m, papa); tick(m); m.events = [];
    const shots = papa.stats2.shots;
    tick(m, inp({ shootPressed: true, shoot: true }));
    expect(orders(m)).toEqual([1]); expect(me.act).toBeNull();
    let shot = false; for (let i = 0; i < 45 && !shot; i++) { tick(m); shot = papa.stats2.shots > shots; }
    expect(shot).toBe(true);
    for (let i = 0; i < 20; i++) tick(m);
    expect(m.ball.x).toBeGreaterThan(PITCH.w - 240);
  });
  it('¡Especial!: con la barra llena, el capitán lanza el poder del compañero que lleva el balón, y la barrita es suya', () => {
    const { m, me } = mk(true); const papa = fam(m, 'papa');
    put(me, 500, MID + 120); put(papa, PITCH.w - 260, MID); give(m, papa); m.bar[0] = T.bar.max; tick(m);
    tick(m, inp({ specialPressed: true, special: true }));
    expect(m.special).not.toBeNull(); expect(m.special!.shooter).toBe(papa.id); expect(m.special!.kind).toBe('canonazo'); expect(m.special!.charge.slot).toBe(0);
    expect(me.state).not.toBe('special');
  });
  it('¡Quítasela!: lejos del rival que lleva el balón, Tiro manda al compañero más cercano a barrerlo y yo no me tiro', () => {
    const { m, me } = mk(true); const papa = fam(m, 'papa'), r = rival(m, 3);
    put(me, 200, MID + 150); put(papa, 560, MID + 10); put(r, 640, MID); give(m, r); tick(m); m.events = [];
    tick(m, inp({ shootPressed: true, shoot: true }));
    expect(orders(m)).toEqual([2]); expect(papa.order?.kind).toBe('tackle'); expect(me.act).toBeNull();
    let hit = false;
    for (let i = 0; i < 150 && !hit; i++) { tick(m); hit = papa.act?.kind === 'slide' || m.events.some((e) => (e.k === 'steal' || e.k === 'slidehit' || e.k === 'down') ) || m.ball.owner === papa.id; }
    expect(hit).toBe(true);
  });
  it('si el más cercano soy yo, Tiro es mi barrida de siempre (no hay orden)', () => {
    const { m, me } = mk(true); const papa = fam(m, 'papa'), r = rival(m, 3);
    put(me, 600, MID); put(papa, 300, MID + 100); put(r, 640, MID); give(m, r); tick(m); m.events = [];
    tick(m, inp({ shootPressed: true, shoot: true, mx: 1 }));
    expect(orders(m)).toEqual([]); expect(me.act).not.toBeNull();
  });
  it('sin capitán, lejos del rival, Tiro no da órdenes (el control ya salta solo al más cercano)', () => {
    const { m, me } = mk(false); const papa = fam(m, 'papa'), r = rival(m, 3);
    put(me, 200, MID + 150); put(papa, 560, MID + 10); put(r, 640, MID); give(m, r);
    m.humans[0].since = 1e9; tick(m); m.events = [];
    tick(m, inp({ shootPressed: true, shoot: true }));
    expect(orders(m)).toEqual([]);
  });
  it('Thor con el balón en las manos: el capitán con el stick quieto y Pase se la pide a él', () => {
    const { m, me } = mk(true); const thor = fam(m, 'thor');
    put(me, 260, MID + 90); put(thor, 14, MID); m.ball.state = 'held'; m.ball.owner = thor.id; thor.state = 'hold'; thor.holdT = 1;
    tick(m); tick(m, inp({ passPressed: true, pass: true }));
    let got = false; for (let i = 0; i < 150 && !got; i++) { tick(m); got = m.ball.owner === me.id; }
    expect(m.lastPass?.to).toBe(me.id); expect(got).toBe(true);
  });
});

describe('a quién salta el control cuando un rival lleva el balón', () => {
  const setup = (): { m: Match; cur: Player; back: Player; r: Player } => {
    const m = createMatch({ ai: 'none', skipKickoff: true, seed: 1, humans: [{ team: 0, slot: 4, humanSlot: 0, controls: 'full' }] });
    for (const p of m.players) p.speedMult = 1; clear(m);
    const cur = m.players.find((p) => p.id === m.humans[0].id)!, back = fam(m, 'papa'), r = rival(m, 3);
    return { m, cur, back, r };
  };
  it('si al mío ya lo pasaron, salta al que todavía está entre el rival y nuestro arco, aunque esté un poco más lejos', () => {
    const { m, cur, back, r } = setup();
    // the rival runs at our goal (x = 0): he is already past my player, and Papá waits further back
    put(r, 400, MID); give(m, r); r.vx = -100; put(cur, 430, MID + 6); put(back, 340, MID + 20);
    for (let i = 0; i < 40; i++) { r.input = inp({ mx: -1 }); tick(m); }
    expect(m.humans[0].id).toBe(back.id);
  });
  it('si el mío está encima del rival y de frente, no cambia aunque otro esté parecido', () => {
    const { m, cur, back, r } = setup();
    put(r, 400, MID); give(m, r); put(cur, 370, MID + 4); put(back, 350, MID - 30);
    for (let i = 0; i < 40; i++) tick(m);
    expect(m.humans[0].id).toBe(cur.id);
  });
});
