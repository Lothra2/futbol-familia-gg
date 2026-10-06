// M5 (D8): the cinematic of every power. Full 3.5 s, short 2.0 s, off 0.6 s, a tap ends it, every picture is drawn at a whole-number scale,
// the ball flies after it and the result lands. Shots of every panel in docs/qa/shots/cine_*.png.
import { startPreview, launch, openGame } from './lib.mjs';
const srv = await startPreview();
const b = await launch();
let bad = 0;
const ok = (name, cond, extra = '') => { console.log(cond ? 'PASS' : 'FAIL', name, extra); if (!cond) bad++; };
const WHO = ['sophie', 'alana', 'papa', 'mama', 'juandi', 'thor', 'dragon'];
const Q = (who, extra = '') => `mode=quick&half=60&seed=5&forceSpecial=${who}&autoplay=quieto${who === 'juandi' ? '&squad=papa,mama,juandi,alana' : ''}${extra}`;

// the sampler runs inside the page: every frame it records the sim time of the cinematic and the scale of every picture it shows
const sampler = () => {
  const s = window.__futbol.scene; window.__cs = { bad: [], n: 0, t0: null, t1: 0, dur: 0, active: 0 };
  s.events.on('postupdate', () => {
    const m = s.match, c = window.__cs;
    if (m.phase === 'cinematic' && m.special) {
      c.n++; if (c.t0 === null) c.t0 = m.special.t; c.t1 = m.special.t; c.dur = m.special.dur; if (s.cine.active) c.active++;
      for (const im of s.cine.pictures()) if (im.visible && (!Number.isInteger(im.scaleX) || im.scaleX !== im.scaleY)) c.bad.push([im.texture.key, im.scaleX, im.scaleY]);
    }
  });
};

for (const who of WHO) {
  const { page, errors, ctx } = await openGame(b, srv.url, Q(who, '&cine=full'), { viewport: { width: 1280, height: 720 } });
  await page.waitForFunction(() => window.__futbol?.match?.phase === 'cinematic', null, { timeout: 20000 });
  await page.evaluate(sampler);
  const marks = [0.08, 0.15, 0.28, 0.4, 0.55, 0.78, 0.95];
  for (let i = 0; i < marks.length; i++) {
    await page.waitForFunction((f) => { const m = window.__futbol.match; return !m.special || m.special.t >= f * m.special.dur; }, marks[i], { timeout: 8000 });
    await page.screenshot({ path: `docs/qa/shots/cine_${who}_${i + 1}.png` });
  }
  await page.waitForFunction(() => window.__futbol.match.phase !== 'cinematic', null, { timeout: 8000 });
  const r = await page.evaluate(() => window.__cs);
  ok(`${who}: la cinemática completa dura 3,5 s de simulación`, Math.abs(r.dur - 3.5) < 0.01 && r.t1 > 3.3, `dur ${r.dur} t1 ${r.t1.toFixed(2)}`);
  ok(`${who}: la cinemática se dibujó en pantalla`, r.active > 10, `frames ${r.active}`);
  ok(`${who}: todas las imágenes a escala entera`, r.bad.length === 0, JSON.stringify(r.bad.slice(0, 3)));
  // after it the ball flies by itself and the result lands
  const f = await page.evaluate(() => { const m = window.__futbol.match; return { flight: !!m.flight, state: m.ball.state, kind: m.flight && m.flight.kind }; });
  ok(`${who}: sigue el vuelo del balón en la cancha`, f.flight && f.state === 'scripted', JSON.stringify(f));
  await page.waitForFunction(() => !window.__futbol.match.flight, null, { timeout: 8000 });
  await page.waitForTimeout(200);
  const end = await page.evaluate(() => { const m = window.__futbol.match; return { phase: m.phase, score: m.score, scripted: m.ball.state === 'scripted' }; });
  ok(`${who}: el resultado llega (gol o rebote) y el balón vuelve a ser libre`, !end.scripted && (end.phase === 'goal' || end.phase === 'play'), JSON.stringify(end));
  ok(`${who}: sin errores de consola`, errors.length === 0, errors.join('|'));
  await ctx.close();
}

// short, off and the tap that skips it
{
  const { page, errors, ctx } = await openGame(b, srv.url, Q('sophie', '&cine=short'), { viewport: { width: 1280, height: 720 } });
  await page.waitForFunction(() => window.__futbol?.match?.phase === 'cinematic', null, { timeout: 20000 });
  const d = await page.evaluate(() => window.__futbol.match.special.dur);
  ok('cinemática corta: 2,0 s', Math.abs(d - 2.0) < 0.01, `dur ${d}`);
  await ctx.close();
  const o = await openGame(b, srv.url, Q('sophie', '&cine=off'), { viewport: { width: 1280, height: 720 } });
  await o.page.waitForFunction(() => window.__futbol?.match?.phase === 'cinematic', null, { timeout: 20000 });
  const od = await o.page.evaluate(() => ({ dur: window.__futbol.match.special.dur, active: window.__futbol.scene.cine.active }));
  ok('sin cinemática: 0,6 s y sin pantallas', Math.abs(od.dur - 0.6) < 0.01 && !od.active, JSON.stringify(od));
  ok('corta y sin cinemática sin errores', errors.length === 0 && o.errors.length === 0, [...errors, ...o.errors].join('|'));
  await o.ctx.close();
}
{
  // a human taps the screen at 0.5 s of the cinematic: it ends within 0.1 s of simulation
  const { page, errors, ctx } = await openGame(b, srv.url, 'mode=quick&half=60&seed=5&forceSpecial=papa&cine=full', { viewport: { width: 1280, height: 720 } });
  await page.waitForFunction(() => window.__futbol?.match?.phase === 'cinematic' && window.__futbol.match.special.t >= 0.5, null, { timeout: 20000 });
  const t0 = await page.evaluate(() => ({ cine: window.__futbol.match.special.t, sim: window.__futbol.match.t }));
  await page.mouse.click(640, 360);
  await page.waitForFunction(() => window.__futbol.match.phase !== 'cinematic', null, { timeout: 3000 });
  const t1 = await page.evaluate(() => window.__futbol.match.t);
  ok('un toque a los 0,5 s la termina antes de 0,6 s de simulación', t1 - t0.sim < 0.6 && t0.cine < 3.0, `tocó en ${t0.cine.toFixed(2)} de 3,5 y terminó ${(t1 - t0.sim).toFixed(2)} s después`);
  await page.waitForTimeout(200);
  const after = await page.evaluate(() => ({ cine: window.__futbol.scene.cine.active, hud: document.getElementById('hud').classList.contains('cinema') }));
  ok('al saltarla la cinemática desaparece y el marcador vuelve', !after.cine && !after.hud, JSON.stringify(after));
  ok('saltar sin errores', errors.length === 0, errors.join('|'));
  await ctx.close();
}
await b.close(); srv.stop();
console.log(bad ? `${bad} FAIL` : 'cine: all passed');
process.exit(bad ? 1 : 0);
