// The free kick of the practice with Thor: the wall of cones, the aim, the meter, and a kick taken with the keyboard. Shots in docs/qa/shots/tirolibre_*.png.
import { startPreview, launch, openGame } from './lib.mjs';
const srv = await startPreview();
const b = await launch();
let bad = 0;
const later = (page, sec) => page.evaluate(async (sec) => { const m = window.__futbol.match, t0 = m.t; while (m.t - t0 < sec) await new Promise((r) => setTimeout(r, 30)); }, sec);   // the simulation runs slowly in a headless browser: wait in match seconds
const ok = (name, cond, extra = '') => { console.log(cond ? 'PASS' : 'FAIL', name, extra); if (!cond) bad++; };
for (const [w, h] of [[1280, 720], [844, 390]]) {
  const { page, errors, ctx } = await openGame(b, srv.url, 'menu=main', { viewport: { width: w, height: h } });
  await page.waitForSelector('#s-main'); await page.click('#s-main [data-act=training]'); await page.waitForSelector('#s-training');
  await page.evaluate(() => { window.__futbol.app.cfg.controls = ['full', 'full']; });
  await page.click('.go');
  await page.waitForFunction(() => window.__futbol.match?.phase, null, { timeout: 10000 });
  await page.evaluate(() => { window.__futbol.scene.training.index = 4; });
  await page.waitForFunction(() => window.__futbol.match.restart?.kind === 'freekick', null, { timeout: 8000 });
  ok(`${w}x${h}: el reto pone un tiro libre`, true);
  await later(page, 1.0);
  await page.screenshot({ path: `docs/qa/shots/tirolibre_${w}x${h}_1_apuntar.png` });
  await page.keyboard.down('ArrowUp'); await page.keyboard.down('ArrowRight'); await later(page, 0.5);
  const aim = await page.evaluate(() => { const fk = window.__futbol.match.restart.fk; return { y: fk.aimY, c: fk.curve }; });
  await page.keyboard.up('ArrowUp'); await page.keyboard.up('ArrowRight');
  ok(`${w}x${h}: el stick mueve la mira y el efecto`, aim.y < 80 && aim.c > 0.5, JSON.stringify(aim));
  // the first Tiro starts the meter, the second one (in the green) kicks
  await page.waitForFunction(() => window.__futbol.match.restart.t > 1.0, null, { timeout: 20000 });
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__futbol.match.restart?.fk.stage === 'meter', null, { timeout: 4000 });
  ok(`${w}x${h}: el primer Tiro arranca el medidor sin patear`, await page.evaluate(() => window.__futbol.match.phase === 'restart'));
  await page.waitForFunction(() => { const r = window.__futbol.match.restart; return r && (r.t - r.fk.mt) / 1.6 > 0.4 && (r.t - r.fk.mt) / 1.6 < 0.5; }, null, { timeout: 8000, polling: 10 });
  await page.screenshot({ path: `docs/qa/shots/tirolibre_${w}x${h}_2_ahora.png` });
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__futbol.match.phase !== 'restart', null, { timeout: 4000 });
  await later(page, 0.25);
  await page.screenshot({ path: `docs/qa/shots/tirolibre_${w}x${h}_3_vuelo.png` });
  const taken = await page.evaluate(() => window.__futbol.match.data.fkTaken);
  ok(`${w}x${h}: el tiro sale con Tiro`, taken === 1, String(taken));
  ok(`${w}x${h}: sin errores de consola`, errors.length === 0, errors.join('|'));
  await ctx.close();
}
await b.close(); srv.stop();
process.exit(bad ? 1 : 0);
