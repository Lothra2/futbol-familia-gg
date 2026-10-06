// Settings of the touch buttons are on screen and work, the pause menu changes them too, and a match after the practice is a real match (the rival moves).
import { startPreview, launch, openGame } from './lib.mjs';
const srv = await startPreview();
const b = await launch();
let bad = 0;
const ok = (name, cond, extra = '') => { console.log(cond ? 'PASS' : 'FAIL', name, extra); if (!cond) bad++; };
const later = (page, sec) => page.evaluate(async (sec) => { const m = window.__futbol.match, t0 = m.t; while (m.t - t0 < sec) await new Promise((r) => setTimeout(r, 30)); }, sec);
{
  const { page, errors, ctx } = await openGame(b, srv.url, 'menu=main', { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  await page.waitForSelector('#s-main'); await page.click('#s-main [data-act=settings]'); await page.waitForSelector('#s-settings');
  const vis = await page.evaluate(() => ['touchmode', 'look'].map((id) => { const e = document.querySelector(`#s-settings #${id}`); return !!e && e.getBoundingClientRect().height > 10; }));
  ok('ajustes: se ven los dos grupos de botones (cuándo salen y cuánto tapan)', vis[0] && vis[1], JSON.stringify(vis));
  await page.click('#s-settings #look .chip-o:nth-child(2)');
  const set = await page.evaluate(() => ({ look: window.__futbol.store.data.settings.touchLook, dom: document.getElementById('touch').dataset.look }));
  ok('ajustes: "Casi invisibles" se guarda y se aplica', set.look === 'minimo' && set.dom === 'minimo', JSON.stringify(set));
  ok('ajustes: sin errores', errors.length === 0, errors.join('|'));
  await ctx.close();
}
// the practice must not leak into the next matches
{
  const { page, errors, ctx } = await openGame(b, srv.url, 'menu=main', { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  await page.waitForSelector('#s-main'); await page.click('#s-main [data-act=training]'); await page.waitForSelector('#s-training');
  await page.click('#s-training #tdrill .chip-o:nth-child(3)');   // Penales
  await page.click('.go');
  await page.waitForFunction(() => window.__futbol.match?.training, null, { timeout: 10000 });
  await page.waitForFunction(() => window.__futbol.match.phase === 'penalties' && window.__futbol.match.pen?.practice, null, { timeout: 20000 });
  ok('práctica de penales: empieza sola con la vista de penales', true);
  await page.screenshot({ path: 'docs/qa/shots/practica_penales.png' });
  // pause menu on a touch device: the look of the buttons can be changed from there
  await page.click('#pause');
  await page.waitForSelector('#pause-menu #look');
  const before = await page.evaluate(() => document.querySelector('#pause-menu #look').textContent);
  await page.click('#pause-menu #look');
  const after = await page.evaluate(() => ({ t: document.querySelector('#pause-menu #look').textContent, dom: document.getElementById('touch').dataset.look }));
  ok('pausa: el botón cambia cómo se ven los botones', before !== after.t, `${before} -> ${after.t} (${after.dom})`);
  await page.click('#pause-menu #quit');
  await page.waitForSelector('#s-main');
  const cfg = await page.evaluate(() => ({ training: window.__futbol.app.cfg.training, rival: window.__futbol.app.cfg.rival, diff: window.__futbol.app.cfg.difficulty }));
  ok('al volver al menú la configuración ya no es de práctica', !cfg.training, JSON.stringify(cfg));
  await page.click('#s-main [data-act=quick]'); await page.waitForSelector('#s-quick');
  await page.click('#s-quick .go');
  await page.waitForSelector('#coach', { timeout: 5000 }).then(() => page.click('#cskip')).catch(() => {});   // the tour of the first match
  await page.waitForFunction(() => window.__futbol.match?.phase === 'play' || window.__futbol.match?.phase === 'kickoff', null, { timeout: 15000 });
  const m0 = await page.evaluate(() => ({ training: window.__futbol.match.training, pos: window.__futbol.match.players.filter((p) => p.team === 1 && p.role !== 'gk').map((p) => [p.x, p.y]) }));
  ok('partida rápida después de practicar: no es práctica', m0.training === false);
  await page.waitForFunction(() => window.__futbol.match.phase === 'play', null, { timeout: 15000 });
  await later(page, 5);
  const m1 = await page.evaluate(() => window.__futbol.match.players.filter((p) => p.team === 1 && p.role !== 'gk').map((p) => [p.x, p.y]));
  const moved = m1.some((p, i) => Math.hypot(p[0] - m0.pos[i][0], p[1] - m0.pos[i][1]) > 20);
  ok('partida rápida después de practicar: el rival se mueve', moved, JSON.stringify([m0.pos, m1]));
  ok('sin errores', errors.length === 0, errors.join('|'));
  await ctx.close();
}
// the free kick drill of the menu starts on its own
{
  const { page, errors, ctx } = await openGame(b, srv.url, 'menu=main', { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  await page.waitForSelector('#s-main'); await page.click('#s-main [data-act=training]'); await page.waitForSelector('#s-training');
  await page.click('#s-training #tdrill .chip-o:nth-child(2)');   // Tiros libres
  await page.click('.go');
  await page.waitForFunction(() => window.__futbol.match?.restart?.kind === 'freekick', null, { timeout: 20000 });
  ok('práctica de tiros libres: empieza sola con la barrera de conos', await page.evaluate(() => window.__futbol.match.restart.fk.wall.length === 2));
  ok('práctica de tiros libres: sin errores', errors.length === 0, errors.join('|'));
  await ctx.close();
}
await b.close(); srv.stop();
process.exit(bad ? 1 : 0);
