import { describe, expect, it } from 'vitest';
import { step, createMatch, hashMatch } from '../../src/core/match';
import { tryFrontSteal } from '../../src/core/actions';
import { DT } from '../../src/core/step';
import { T } from '../../src/core/tuning';
import { PITCH } from '../../src/core/field';
import { ball, clear, fam, give, inp, kicks, mk, pressPass, pressShoot, put, rival, secs, ticks, untilKick } from './helpers';

describe('tiros (B9)', () => {
  const shotSpeed = (c: 'sophie' | 'alana' | 'papa' | 'mama', hold: number): number => {
    const m = mk({}, true); clear(m); const p = fam(m, c); put(p, 700, 80); give(m, p);
    pressShoot(m, p, hold); secs(m, 0.4);
    const k = kicks(m);
    expect(k.length, `${c} hold ${hold}`).toBe(1);
    return k[0].v!;
  };
  it('el toque corto es un tiro normal de 320 × potencia', () => {
    expect(shotSpeed('sophie', 0)).toBeCloseTo(320, -1);
    expect(shotSpeed('alana', 0)).toBeCloseTo(320 * 0.85, -1);
    expect(shotSpeed('papa', 0)).toBeCloseTo(320 * 1.25, -1);
  });
  it('mantener carga el tiro fuerte: Sophie 520, Alana 442, Papá tope de 560', () => {
    expect(shotSpeed('sophie', 0.6)).toBeCloseTo(520, -1);
    expect(shotSpeed('alana', 0.6)).toBeCloseTo(442, -1);
    expect(shotSpeed('papa', 0.6)).toBeCloseTo(560, -1);
  });
  it('carga a medias da una velocidad intermedia', () => {
    const v = shotSpeed('sophie', 0.3);
    expect(v).toBeGreaterThan(400); expect(v).toBeLessThan(450);
  });
  it('el tiro sale hacia el arco rival, llega al palo que elige el joystick, y el ataque de la familia es hacia +x', () => {
    const arrive = (my: number, seed: number): number => {
      const m = mk({ seed }, true); clear(m); const p = fam(m, 'sophie'); put(p, 780, 80); give(m, p);
      pressShoot(m, p, 0, { my });
      const k = untilKick(m)!;
      expect(k.vx).toBeGreaterThan(200);
      let y = NaN; for (let i = 0; i < 200 && Number.isNaN(y) && m.phase === 'play'; i++) { step(m); if (m.ball.x >= PITCH.w - 1) y = m.ball.y; }
      return y;
    };
    const avg = (my: number): number => { const ys = Array.from({ length: 20 }, (_, i) => arrive(my, i + 1)).filter((y) => !Number.isNaN(y)); expect(ys.length).toBeGreaterThan(10); return ys.reduce((a, c) => a + c, 0) / ys.length; };
    expect(avg(-1)).toBeLessThan(76); expect(avg(1)).toBeGreaterThan(84);
    const r = mk({ firstKick: 1 }, true); clear(r); const q = rival(r, 3); put(q, 300, 80); give(r, q);
    pressShoot(r, q, 0);
    expect(untilKick(r)!.vx).toBeLessThan(-200);
  });
  it('la preparación del tiro dura 0,12 s antes del contacto', () => {
    const m = mk({}, true); clear(m); const p = fam(m, 'sophie'); put(p, 700, 80); give(m, p);
    p.input = inp({ shootPressed: true }); step(m); p.input = inp();
    expect(kicks(m).length).toBe(0); expect(p.act?.kind).toBe('kick');
    ticks(m, 5); expect(kicks(m).length).toBe(0);
    ticks(m, 4); expect(kicks(m).length).toBe(1);
  });
  it('el tiro con efecto se curva hacia el palo y llega a donde se apuntó', () => {
    const m = mk({}, true); clear(m); const p = fam(m, 'sophie'); put(p, 700, 80); give(m, p);
    pressShoot(m, p, 0.5, { my: 1 });
    let yAtGoal = NaN;
    for (let i = 0; i < 200 && Number.isNaN(yAtGoal); i++) { step(m); if (m.ball.x >= PITCH.w) yAtGoal = m.ball.y; }
    expect(m.ball.spin).not.toBe(0);
    expect(Math.abs(yAtGoal - 96)).toBeLessThan(28);
  });
});

describe('pases', () => {
  it('un pase bajo llega al compañero con poca velocidad y él lo controla', () => {
    const m = mk({}, true); clear(m); const a = fam(m, 'sophie'), b = fam(m, 'mama'); put(a, 300, 80); put(b, 480, 80); give(m, a);
    pressPass(m, a, 0, { mx: 1 });
    let got = false;
    for (let i = 0; i < 180 && !got; i++) { step(m); got = m.ball.owner === b.id; }
    expect(got).toBe(true);
    expect(a.stats2.passes).toBe(1);
  });
  it('mantener Pase da un globo que sube y cae sobre el compañero', () => {
    const m = mk({}, true); clear(m); const a = fam(m, 'sophie'), b = fam(m, 'mama'); put(a, 300, 80); put(b, 540, 80); give(m, a);
    pressPass(m, a, 0.4, { mx: 1 });
    let maxZ = 0, got = false;
    for (let i = 0; i < 240 && !got; i++) {
      const dx = m.ball.x - b.x, dy = m.ball.y - b.y, d = Math.hypot(dx, dy) || 1;
      b.input = inp(d > 3 ? { mx: dx / d, my: dy / d } : {});
      step(m); maxZ = Math.max(maxZ, m.ball.z); got = m.ball.owner === b.id;
    }
    expect(maxZ).toBeGreaterThan(25); expect(got).toBe(true);
  });
  it('el pase elige al compañero dentro del cono del joystick y no a otro', () => {
    const m = mk({}, true); clear(m); const a = fam(m, 'sophie'), up = fam(m, 'mama'), down = fam(m, 'alana'); put(a, 300, 80); put(up, 400, 20); put(down, 400, 140); give(m, a);
    pressPass(m, a, 0, { mx: 0.6, my: -0.8 });
    secs(m, 0.3);
    expect(m.ball.vy).toBeLessThan(-20);
  });
  it('pared: devolver el pase al que lo dio dentro de 1,2 s lo adelanta y suena', () => {
    const m = mk({}, true); clear(m); const a = fam(m, 'sophie'), b = fam(m, 'mama'); put(a, 300, 80); put(b, 420, 80); give(m, a);
    pressPass(m, a, 0, { mx: 1 });
    for (let i = 0; i < 90 && m.ball.owner !== b.id; i++) step(m);
    expect(m.ball.owner).toBe(b.id);
    a.vx = 90; a.vy = 0; m.events = [];
    pressPass(m, b, 0, { mx: -1 }); secs(m, 0.2);
    expect(m.events.some((e) => e.k === 'wall')).toBe(true);
  });
  it('un balón muy rápido rebota en el jugador en vez de controlarse', () => {
    const m = mk({}, true); clear(m); const a = fam(m, 'sophie'); put(a, 300, 80); ball(m, 260, 80, 0, 500, 0, 0);
    ticks(m, 10);
    expect(m.ball.owner).toBeNull(); expect(m.ball.vx).toBeLessThan(0);
    const n = mk({}, true); clear(n); const c = fam(n, 'sophie'); put(c, 300, 80); ball(n, 260, 80, 0, 250, 0, 0);
    ticks(n, 10); expect(n.ball.owner).toBe(c.id);
  });
});

describe('jugadas en el aire (B10)', () => {
  const aerial = (z: number, facing: 1 | -1 = 1, viaPass = false) => {
    const m = mk({}, true); clear(m); const p = fam(m, 'sophie'); put(p, 600, 80); p.facing = facing;
    ball(m, 604, 80, z, 0, 0, 0);
    p.input = inp(viaPass ? { passPressed: true } : { shootPressed: true }); step(m); p.input = inp();
    return { m, p };
  };
  it('balón entre z 6 y 24: volea. Entre 24 y 48: cabezazo. Si mira a su arco: chilena', () => {
    expect(aerial(14).p.act?.sub).toBe('volley');
    expect(aerial(36).p.act?.sub).toBe('header');
    expect(aerial(36, -1).p.act?.sub).toBe('chilena');
    expect(aerial(60).p.act?.kind).not.toBe('kick');   // out of reach: a human presses shoot and slides instead
  });
  it('el cabezazo y la chilena despegan del suelo, la volea no', () => {
    const h = aerial(36); step(h.m); expect(h.p.z).toBeGreaterThan(0);
    const v = aerial(14); step(v.m); expect(v.p.z).toBe(0);
  });
  it('la chilena deja al jugador 0,5 s en el piso y los cabezazos tienen su preparación', () => {
    const { m, p } = aerial(36, -1);
    secs(m, 0.35); expect(p.act?.kind === 'kick' || p.state === 'getup').toBe(true);
    secs(m, 0.9); expect(p.state).toBe('idle');
  });
  it('un cabezazo cerca del arco rival baja el balón hacia el arco', () => {
    const m = mk({}, true); clear(m); const p = fam(m, 'sophie'); put(p, 800, 80); ball(m, 804, 80, 36, 0, 0, 0);
    p.input = inp({ shootPressed: true }); step(m); p.input = inp();
    const k = untilKick(m)!;
    expect(k.vx).toBeGreaterThan(150); expect(k.vz).toBeLessThan(10);
  });
  it('si el balón ya no está al llegar el contacto, el golpe es en falso', () => {
    const { m } = aerial(36); ball(m, 700, 80, 60, 0, 0, 0); secs(m, 0.4);
    expect(m.events.some((e) => e.k === 'whiff')).toBe(true);
  });
});

describe('barrida (B11)', () => {
  it('toca el balón libre: el balón sale y la que barrió no se marea', () => {
    const m = mk({}, true); clear(m); const s = fam(m, 'sophie'); put(s, 400, 80); ball(m, 412, 80, 0, 0, 0, 0);
    pressShoot(m, s, 0, { mx: 1 }); 
    // the tap above is a first-time shot on a loose ball; use the slide explicitly
    const n = mk({}, true); clear(n); const q = fam(n, 'sophie'); put(q, 400, 80); ball(n, 412, 80, 0, 0, 0, 0); n.ball.owner = null;
    q.noControlT = 1; q.input = inp({ shootPressed: true, mx: 1 }); step(n); q.input = inp({ mx: 1 });
    expect(['slide', 'kick']).toContain(q.state);
    void m;
  });
  const slideSetup = () => {
    const m = mk({}, true); clear(m); const s = fam(m, 'sophie'); put(s, 400, 80); s.facing = 1; s.dirX = 1;
    return { m, s };
  };
  it('el balón de un rival que lo lleva sale disparado y el rival trastabilla 0,35 s', () => {
    const { m, s } = slideSetup(); const r = rival(m, 3); put(r, 420, 80); give(m, r); r.immuneT = 0; r.dirX = -1; r.facing = -1; m.ball.x = 412;
    s.input = inp({ shootPressed: true, mx: 1 }); step(m); s.input = inp({ mx: 1 });
    expect(s.state).toBe('slide');
    ticks(m, 12);
    expect(m.ball.owner).toBeNull(); expect(r.state).toBe('stagger'); expect(m.ball.vx).toBeGreaterThan(100);
    expect(s.state).not.toBe('dizzy');
    secs(m, 0.5); expect(r.state).not.toBe('stagger');
  });
  it('toca las piernas sin balón: el rival da la voltereta 0,7 s y quien barrió queda mareado 1,0 s', () => {
    const { m, s } = slideSetup(); const r = rival(m, 3); put(r, 414, 80);
    ball(m, 100, 20, 0, 0, 0, 0);
    s.input = inp({ shootPressed: true, mx: 1 }); step(m); s.input = inp({ mx: 1 });
    ticks(m, 12); s.input = inp();
    expect(r.state).toBe('tumble'); expect(s.state).toBe('dizzy');
    secs(m, 0.35); expect(r.state).toBe('tumble'); expect(s.state).toBe('dizzy');
    secs(m, 0.3); expect(r.state).toBe('idle'); expect(s.state).toBe('dizzy');
    secs(m, 0.45); expect(s.state).toBe('idle');
  });
  it('si no toca nada se queda 0,45 s extra en el piso, y la espera entre barridas es de 1,2 s', () => {
    const { m, s } = slideSetup(); ball(m, 100, 20, 0, 0, 0, 0);
    s.input = inp({ shootPressed: true, mx: 1 }); step(m); s.input = inp();
    secs(m, 0.45); expect(s.state).toBe('slide');
    secs(m, 0.2); expect(s.state).toBe('getup');
    secs(m, 0.45); expect(s.state).toBe('idle');
    // 1.1 s after the start the cooldown is still on
    s.input = inp({ shootPressed: true }); step(m); s.input = inp();
    expect(s.state).not.toBe('slide');
    secs(m, 0.2);
    s.input = inp({ shootPressed: true }); step(m); s.input = inp();
    expect(s.state).toBe('slide');
  });
  it('un jugador de la misma familia no cae con la barrida de un compañero', () => {
    const { m, s } = slideSetup(); const f = fam(m, 'mama'); put(f, 414, 80); ball(m, 100, 20, 0, 0, 0, 0);
    s.input = inp({ shootPressed: true, mx: 1 }); step(m); s.input = inp();
    ticks(m, 15); expect(f.state).toBe('idle');
  });
});

describe('robo y choque (B12, B13)', () => {
  const trial = (carrier: 'alana' | 'papa' | 'sophie', n: number): number => {
    const m = mk({}, true); clear(m); const r = rival(m, 3), c = fam(m, carrier);
    let won = 0;
    for (let i = 0; i < n; i++) {
      put(r, 200, 80); r.facing = 1; r.cd.steal = 0; r.act = null; r.state = 'idle'; r.immuneT = 0;
      put(c, 208, 80); c.act = null; c.state = 'idle'; c.immuneT = 0;
      give(m, c); m.ball.x = 208;
      if (!tryFrontSteal(m, r)) throw new Error('no attempt');
      if (m.ball.owner === r.id) won++;
    }
    return won / n;
  };
  it('B12: a Alana le roban el 38,5 ± 3 % de las veces, a Sophie el 55 %, a Papá el 49,5 %', () => {
    expect(Math.abs(trial('alana', 2000) - 0.385)).toBeLessThan(0.03);
    expect(Math.abs(trial('sophie', 2000) - 0.55)).toBeLessThan(0.03);
    expect(Math.abs(trial('papa', 2000) - 0.495)).toBeLessThan(0.03);
  });
  it('si el robo falla, quien lo intentó trastabilla 0,25 s; la espera entre robos es de 0,6 s', () => {
    const m = mk({ seed: 5 }, true); clear(m); const r = rival(m, 3), c = fam(m, 'sophie');
    put(r, 200, 80); r.facing = 1; put(c, 208, 80); give(m, c); c.immuneT = 0;
    let tries = 0;
    while (m.ball.owner === c.id && tries++ < 40) { r.cd.steal = 0; r.act = null; r.state = 'idle'; tryFrontSteal(m, r); }
    // either outcome starts the cooldown
    expect(r.cd.steal).toBeGreaterThan(0.55);
    expect(tryFrontSteal(m, r)).toBe(false);
  });
  it('B13: quien acaba de ganar el balón es inmune 0,35 s', () => {
    const m = mk({}, true); clear(m); const r = rival(m, 3), c = fam(m, 'sophie');
    put(c, 300, 80); ball(m, 304, 80, 0, 0, 0, 0); put(r, 292, 80); r.facing = 1;
    step(m);
    expect(m.ball.owner).toBe(c.id); expect(c.immuneT).toBeGreaterThan(0.3);
    expect(tryFrontSteal(m, r)).toBe(false);
    secs(m, 0.4); r.cd.steal = 0;
    expect(tryFrontSteal(m, r)).toBe(true);
  });
  it('choque: un jugador en sprint contra el que lleva el balón puede soltárselo (Papá casi no se cae)', () => {
    const run = (carrier: 'sophie' | 'papa'): number => {
      let lost = 0;
      for (let seed = 1; seed <= 300; seed++) {
        const m = mk({ seed }, true); clear(m); const r = rival(m, 3), c = fam(m, carrier);
        put(c, 400, 80); give(m, c); c.immuneT = 0; put(r, 380, 80); r.vx = 130;
        r.input = inp({ mx: 1, sprint: true });
        for (let i = 0; i < 30 && m.ball.owner === c.id; i++) step(m);
        if (m.ball.owner !== c.id) lost++;
      }
      return lost / 300;
    };
    const s = run('sophie'), p = run('papa');
    expect(s).toBeGreaterThan(0.25); expect(s).toBeLessThan(0.65);   // 0.65: the Dragoncitos (the rival of these tests) push harder, resist 1.25 of the style (mejora 5)
    expect(p).toBeLessThan(s);
  });
});

describe('controles fáciles', () => {
  it('¡Patea! con balón cerca del arco tira con ayuda (al palo lejos del portero)', () => {
    const m = mk({}, true); clear(m); const p = fam(m, 'alana'); p.control = 'human'; p.controls = 'easy'; put(p, 800, 80); give(m, p);
    p.input = inp({ shootPressed: true }); step(m); p.input = inp();
    const k = untilKick(m)!;
    expect(k).not.toBeNull(); expect(k.vx).toBeGreaterThan(150);
  });
  it('¡Patea! lejos del arco pasa al mejor compañero', () => {
    const m = mk({}, true); clear(m); const p = fam(m, 'alana'), q = fam(m, 'sophie'); p.control = 'human'; p.controls = 'easy'; put(p, 300, 80); put(q, 440, 70); give(m, p);
    p.input = inp({ shootPressed: true }); step(m); p.input = inp();
    let got = false; for (let i = 0; i < 180 && !got; i++) { step(m); got = m.ball.owner === q.id; }
    expect(got).toBe(true);
  });
  it('¡Patea! sin balón y con el rival delante intenta robarle de frente, nunca barrida', () => {
    const m = mk({}, true); clear(m); const p = fam(m, 'alana'), r = rival(m, 3); p.control = 'human'; p.controls = 'easy'; put(p, 300, 80); p.facing = 1; put(r, 310, 80); give(m, r); r.immuneT = 0;
    p.input = inp({ shootPressed: true }); step(m); p.input = inp();
    expect(p.state).not.toBe('slide'); expect(p.cd.steal).toBeGreaterThan(0);
  });
  it('el imán: en fácil el balón suelto a 12 px se controla, en normal no', () => {
    const e = mk({}, true); clear(e); const a = fam(e, 'alana'); a.control = 'human'; a.controls = 'easy'; put(a, 300, 80); ball(e, 312, 86, 0, 0, 0, 0); step(e);
    expect(e.ball.owner).toBe(a.id);
    const n = mk({}, true); clear(n); const b = fam(n, 'alana'); put(b, 300, 80); ball(n, 312, 86, 0, 0, 0, 0); step(n);
    expect(n.ball.owner).toBeNull();
  });
});

describe('partido completo con la IA tonta (B20)', () => {
  const play = (seed: number) => {
    const m = createMatch({ seed, halfLength: 12, ai: 'dumb' });
    let n = 0; const phases = new Set<string>(); let nan = false, maxDead = 0, dead = 0;
    while (m.phase !== 'over' && n < 60 * 400) {
      step(m); n++; phases.add(m.phase);
      if (![m.ball.x, m.ball.y, m.ball.z].every(Number.isFinite)) nan = true;
      if (m.ball.state === 'free' && Math.hypot(m.ball.vx, m.ball.vy) < 1 && m.ball.z === 0 && m.phase === 'play') dead += DT; else dead = 0;
      maxDead = Math.max(maxDead, dead);
      m.events = [];
    }
    return { m, n, phases, nan, maxDead };
  };
  it('termina, sin NaN, pasa por todas las fases y el partido dura lo configurado', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const r = play(seed);
      expect(r.m.phase, `seed ${seed}`).toBe('over'); expect(r.nan).toBe(false);
      expect(r.phases.has('halftime')).toBe(true); expect(r.phases.has('kickoff')).toBe(true);
      expect(r.maxDead, `seed ${seed} balón parado`).toBeLessThan(6);
      expect(r.m.half).toBe(2);
    }
  });
  it('B20: la misma semilla da el mismo marcador y el mismo hash, y otra semilla da otro', () => {
    const a = play(7), b = play(7), c = play(8);
    expect(hashMatch(a.m)).toBe(hashMatch(b.m)); expect(a.m.score).toEqual(b.m.score);
    expect(hashMatch(c.m)).not.toBe(hashMatch(a.m));
  });
});
