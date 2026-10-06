// The shootout from behind the shooter: a tie goes to penalties, the epic view draws, a human can aim with the stick and the shootout ends. Shots in docs/qa/shots/penales_*.png.
import { startPreview, launch, openGame } from './lib.mjs';
const srv = await startPreview();
const b = await launch();
let bad = 0;
const ok = (name, cond, extra = '') => { console.log(cond ? 'PASS' : 'FAIL', name, extra); if (!cond) bad++; };
for (const [w, h] of [[1280, 720], [844, 390], [667, 375]]) {
  const { page, errors, ctx } = await openGame(b, srv.url, 'mode=quick&half=5&seed=7&autoplay=quieto&cine=off&controls=full&stadium=arrecife', { viewport: { width: w, height: h } });
  await page.waitForFunction(() => window.__futbol?.match?.phase === 'play', null, { timeout: 20000 });
  await page.waitForFunction(() => window.__futbol.match.phase === 'penalties', null, { timeout: 90000 });
  ok(`${w}x${h}: el empate va a penales`, true);
  const shot = async (n) => page.screenshot({ path: `docs/qa/shots/penales_${w}x${h}_${n}.png` });
  await page.waitForFunction(() => { const p = window.__futbol.match.pen; return p && p.step === 'ready' && p.t > 0.8; }, null, { timeout: 8000 }); await shot('1_listo');
  // the family kicks (a person, with the keyboard instead of the bot) when it is its turn
  await page.waitForFunction(() => { const p = window.__futbol.match.pen; return p.turn === 0 && p.step === 'ready' && p.t > 0.3; }, null, { timeout: 60000 });
  await page.evaluate(() => { const c = window.__futbol.scene.ctl; c.bots = []; c.router = window.__futbol.router; });
  await page.waitForFunction(() => window.__futbol.match.pen.step === 'aim', null, { timeout: 8000 });
  await page.keyboard.down('ArrowUp'); await page.keyboard.down('ArrowLeft'); await page.evaluate(async () => { const m = window.__futbol.match, t0 = m.pen.t; while (m.pen.step === 'aim' && m.pen.t - t0 < 0.5) await new Promise((r) => setTimeout(r, 30)); }); await shot('2_apuntar');
  const aim = await page.evaluate(() => { const p = window.__futbol.match.pen; return { y: p.aimY, z: p.aimZ, s: p.turn }; });
  ok(`${w}x${h}: las flechas mueven la mira (arriba sube la altura, izquierda cambia el lado)`, aim.z > 0.9 && Math.abs(aim.y - 80) > 10, JSON.stringify(aim));
  await page.keyboard.up('ArrowUp'); await page.keyboard.up('ArrowLeft');
  await page.waitForFunction(() => window.__futbol.match.pen.step === 'fly', null, { timeout: 12000 }); await page.waitForTimeout(250); await shot('3_vuelo');
  await page.waitForFunction(() => window.__futbol.match.pen.step === 'result', null, { timeout: 8000 }); await page.waitForTimeout(500); await shot('4_resultado');
  const vis = await page.evaluate(() => !!window.__futbol.scene.penCine);
  ok(`${w}x${h}: la vista épica existe`, vis);
  await page.waitForFunction(() => window.__futbol.match.phase === 'over', null, { timeout: 150000 });
  ok(`${w}x${h}: la tanda termina`, true, JSON.stringify(await page.evaluate(() => window.__futbol.match.pen?.kicks)));
  ok(`${w}x${h}: sin errores de consola`, errors.length === 0, errors.join('|'));
  await ctx.close();
}
await b.close(); srv.stop();
process.exit(bad ? 1 : 0);
