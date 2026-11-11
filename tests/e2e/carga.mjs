// The special without a film (Nekketsu): the match never stops, a little bar loads over the head of the shooter, Tiro lets it go (in the yellow
// it is perfect), the ball flies in the shape of the power and the result lands. And the power shots of the air: jump with the ball and Tiro,
// near the goal, is the power shot of the player. Shots in docs/qa/shots/carga_*.png.
import { startPreview, launch, openGame } from './lib.mjs';
const srv = await startPreview();
const b = await launch();
let bad = 0;
const ok = (name, cond, extra = '') => { console.log(cond ? 'PASS' : 'FAIL', name, extra); if (!cond) bad++; };
const WHO = ['sophie', 'alana', 'papa', 'mama', 'juandi', 'thor', 'dragon'];
const Q = (who, extra = '') => `mode=quick&half=60&seed=5&forceSpecial=${who}&autoplay=quieto${who === 'juandi' ? '&squad=papa,mama,juandi,alana' : ''}${extra}`;

// the sampler runs inside the page: every frame of the charge it records the phase, the clock and whether the bar is drawn
const sampler = () => {
  const s = window.__futbol.scene, m0 = s.match; window.__cs = { n: 0, bar: 0, phases: {}, clock0: m0.clock, clock1: m0.clock, t0: m0.t, tFlight: null, dur: m0.special ? m0.special.dur : 0, sp: m0.special, hud: 0, anim: {} };
  s.events.on('postupdate', () => {
    const m = s.match, c = window.__cs;
    if (m.special) {
      c.n++; c.phases[m.phase] = 1; c.clock1 = m.clock; if (s.chargeBar.g.commandBuffer.length > 0) c.bar++;
      if (document.getElementById('hud').classList.contains('cinema')) c.hud++;
    } else if (m.flight && c.tFlight === null) c.tFlight = m.t;
  });
};

for (const who of WHO) {
  const { page, errors, ctx } = await openGame(b, srv.url, Q(who), { viewport: { width: 1280, height: 720 } });
  await page.waitForFunction(() => window.__futbol?.scene?.chargeBar && window.__futbol.match?.special, null, { timeout: 20000 });
  await page.evaluate(sampler);
  await page.screenshot({ path: `docs/qa/shots/carga_${who}_1.png` });
  await page.waitForFunction(() => !!window.__futbol.match.flight, null, { timeout: 8000 });
  await page.waitForTimeout(120);
  await page.screenshot({ path: `docs/qa/shots/carga_${who}_2.png` });
  const r = await page.evaluate(() => { const c = window.__cs; return { n: c.n, bar: c.bar, phases: Object.keys(c.phases), clock: c.clock1 - c.clock0, wait: c.tFlight - c.t0, dur: c.dur, hud: c.hud, slot: c.sp && c.sp.charge.slot }; });
  ok(`${who}: no hay película, el partido sigue en juego mientras carga`, r.phases.length === 1 && r.phases[0] === 'play' && r.hud === 0, JSON.stringify(r));
  ok(`${who}: la barrita de carga se dibuja sobre el que tira`, r.n > 3 && r.bar >= r.n - 1, `frames ${r.n}, con barra ${r.bar}`);
  ok(`${who}: el balón sale antes de 1 s (antes eran 3,5 s de película)`, r.wait > 0 && r.wait <= 1.0 && r.dur <= 0.9 + 1e-6, `esperó ${r.wait.toFixed(2)} s, carga de ${r.dur} s`);
  const f = await page.evaluate(() => { const m = window.__futbol.match; return { flight: !!m.flight, state: m.ball.state, kind: m.flight && m.flight.kind }; });
  ok(`${who}: sigue el vuelo del balón en la cancha`, f.flight && f.state === 'scripted', JSON.stringify(f));
  await page.waitForFunction(() => !window.__futbol.match.flight, null, { timeout: 8000 });
  await page.waitForTimeout(200);
  const end = await page.evaluate(() => { const m = window.__futbol.match; return { phase: m.phase, score: m.score, scripted: m.ball.state === 'scripted', special: !!m.special }; });
  ok(`${who}: el resultado llega (gol o rebote) y el balón vuelve a ser libre`, !end.scripted && !end.special && (end.phase === 'goal' || end.phase === 'play'), JSON.stringify(end));
  ok(`${who}: sin errores de consola`, errors.length === 0, errors.join('|'));
  await ctx.close();
}
{
  // a person lets the bar go with Tiro when the needle is in the yellow: perfect, and the ball leaves at once
  let perfect = 0, tries = 0, last = '';
  for (; tries < 3 && !perfect; tries++) {
    const { page, errors, ctx } = await openGame(b, srv.url, 'mode=quick&half=60&seed=5&forceSpecial=sophie&controls=full&chars=sophie', { viewport: { width: 1280, height: 720 } });
    await page.waitForFunction(() => window.__futbol?.match?.special, null, { timeout: 20000 });
    await page.evaluate(() => { window.__sp = window.__futbol.match.special; });
    await page.waitForFunction(() => { const sp = window.__futbol.match.special; return !sp || sp.t >= sp.dur * (sp.charge.perfect[0] + 0.03); }, null, { timeout: 5000, polling: 'raf' });
    await page.keyboard.down('KeyJ'); await page.waitForTimeout(60); await page.keyboard.up('KeyJ');
    await page.waitForFunction(() => !window.__futbol.match.special, null, { timeout: 3000 });
    const r = await page.evaluate(() => ({ hit: window.__sp.charge.hit, t: window.__sp.t, dur: window.__sp.dur, slot: window.__sp.charge.slot, flight: !!window.__futbol.match.flight }));
    last = JSON.stringify(r);
    if (r.hit === 'perfect' && r.t < r.dur - 0.02 && r.flight) perfect++;
    if (tries === 0) ok('la barra es de la persona que juega', r.slot === 0, last);
    ok('soltar la barra sin errores', errors.length === 0, errors.join('|'));
    await ctx.close();
  }
  ok('Tiro con la aguja en el amarillo es ¡PERFECTO! y el balón sale al instante', perfect === 1, `${last} en ${tries} intento(s)`);
}
{
  // the power shot of the air: near the goal, jump with the ball and Tiro up there
  const { page, errors, ctx } = await openGame(b, srv.url, 'mode=quick&half=60&seed=5&controls=full&chars=papa', { viewport: { width: 1280, height: 720 } });
  await page.waitForFunction(() => window.__futbol?.match?.phase === 'play', null, { timeout: 20000 });
  await page.evaluate(() => {
    const m = window.__futbol.match, me = m.players.find((q) => q.humanSlot === 0);
    for (const p of m.players) if (p.id !== me.id) { p.noControlT = 99; p.vx = p.vy = 0; if (p.team === 1 && p.role !== 'gk') { p.x = 300; p.y = 150; } }
    m.humans[0].since = m.t + 10; me.noControlT = 0; me.x = 700; me.y = 80; me.facing = 1;
    Object.assign(m.ball, { x: 706, y: 80, z: 0, vx: 0, vy: 0, vz: 0, state: 'owned', owner: me.id });
  });
  await page.waitForTimeout(150);
  await page.keyboard.down('KeyU'); await page.waitForTimeout(60); await page.keyboard.up('KeyU');
  await page.waitForFunction(() => { const m = window.__futbol.match, p = m.players.find((q) => q.humanSlot === 0); return p.z > 12; }, null, { timeout: 3000, polling: 'raf' });
  await page.keyboard.down('KeyJ'); await page.waitForTimeout(60); await page.keyboard.up('KeyJ');
  await page.waitForFunction(() => !!window.__futbol.match.flight, null, { timeout: 3000 });
  const r = await page.evaluate(() => { const m = window.__futbol.match, p = m.players.find((q) => q.humanSlot === 0); return { kind: m.flight.kind, mine: m.flight.shooter === p.id, z0: m.flight.z0, anim: p.supAnim, state: p.state, pz: p.z }; });
  ok('salto con el balón cerca del arco y Tiro: remate de poder desde el aire', r.mine && !!r.kind && r.z0 > 12 && r.anim === 'spin' && r.state === 'special', JSON.stringify(r));
  await page.waitForTimeout(100);
  await page.screenshot({ path: 'docs/qa/shots/carga_aire.png' });
  await page.waitForFunction(() => !window.__futbol.match.flight, null, { timeout: 8000 });
  ok('remate de poder en el aire sin errores', errors.length === 0, errors.join('|'));
  await ctx.close();
}
await b.close(); srv.stop();
console.log(bad ? `${bad} FAIL` : 'carga: all passed');
process.exit(bad ? 1 : 0);
