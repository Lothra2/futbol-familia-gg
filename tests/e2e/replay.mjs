// The replay of the goal: after the goal cutscene the last seconds play again in slow motion, the match waits, a tap skips it, the setting turns it off.
import { startPreview, launch, openGame } from './lib.mjs';
const srv = await startPreview();
const b = await launch();
let bad = 0;
const ok = (name, cond, extra = '') => { console.log(cond ? 'PASS' : 'FAIL', name, extra); if (!cond) bad++; };
const stage = (page) => page.evaluate(() => {
  const m = window.__futbol.match;
  for (const p of m.players) if (p.role === 'gk') { p.x = 800; p.y = 10; p.noControlT = 99; }
  const sh = m.players.find((p) => p.team === 0 && p.role !== 'gk'); sh.x = 880; sh.y = 80;
  Object.assign(m.ball, { x: 890, y: 80, z: 0, vx: 520, vy: 0, state: 'free', owner: null }); m.ball.lastTouch = { player: sh.id, team: 0, t: m.t };
});
for (const mode of ['replay', 'skip', 'off']) {
  const { page, errors, ctx } = await openGame(b, srv.url, 'mode=quick&half=60&seed=5&autoplay=quieto&cine=full', { viewport: { width: 1280, height: 720 } });
  await page.waitForFunction(() => window.__futbol?.match?.phase === 'play', null, { timeout: 20000 });
  if (mode === 'off') await page.evaluate(() => { window.__futbol.scene.cfg.replay = false; });
  await page.waitForTimeout(1500);                 // some seconds of play to record
  await stage(page);
  await page.waitForFunction(() => window.__futbol.match.phase === 'goal', null, { timeout: 8000 });
  if (mode === 'off') {
    await page.waitForFunction(() => window.__futbol.match.phase !== 'goal', null, { timeout: 8000 });
    await page.waitForTimeout(400);
    ok('con el ajuste apagado no hay repeticion', await page.evaluate(() => !window.__futbol.scene.replay));
  } else {
    await page.waitForFunction(() => !!window.__futbol.scene.replay, null, { timeout: 8000 });
    const a = await page.evaluate(() => ({ tick: window.__futbol.match.tick, phase: window.__futbol.match.phase, cinema: document.getElementById('hud').classList.contains('cinema'), clip: window.__futbol.scene.replay.clip.length }));
    ok(`${mode}: la repeticion empieza despues del gol y hay cuadros grabados`, a.clip > 60 && a.cinema && a.phase !== 'goal', JSON.stringify(a));
    await page.waitForTimeout(900);
    if (mode === 'replay') await page.screenshot({ path: 'docs/qa/shots/repeticion.png' });
    const c = await page.evaluate(() => ({ tick: window.__futbol.match.tick, t: window.__futbol.scene.replay ? window.__futbol.scene.replay.t : -1 }));
    ok(`${mode}: mientras dura, el partido espera`, c.tick === a.tick && c.t > 0.3, JSON.stringify({ a: a.tick, c }));
    if (mode === 'skip') {
      await page.mouse.click(640, 360); await page.waitForTimeout(250);
      ok('un toque salta la repeticion', await page.evaluate(() => !window.__futbol.scene.replay && !document.getElementById('hud').classList.contains('cinema')));
    } else {
      await page.waitForFunction(() => !window.__futbol.scene.replay, null, { timeout: 15000 });
      ok('la repeticion termina sola y el HUD vuelve', await page.evaluate(() => !document.getElementById('hud').classList.contains('cinema')));
    }
    await page.waitForTimeout(500);
    const d = await page.evaluate(() => ({ tick: window.__futbol.match.tick, phase: window.__futbol.match.phase }));
    ok(`${mode}: el partido sigue (saque del medio)`, d.tick > a.tick && ['kickoff', 'play'].includes(d.phase), JSON.stringify(d));
  }
  ok(`${mode}: sin errores de consola`, errors.length === 0, errors.join('|'));
  await ctx.close();
}
await b.close(); srv.stop();
console.log(bad ? `${bad} FAIL` : 'replay: all passed');
process.exit(bad ? 1 : 0);
