// M11 and M12: two players against each other (player 2 plays the rival) and the practice with Thor.
import { startPreview, launch, openGame } from './lib.mjs';
const srv = await startPreview();
const b = await launch();
let bad = 0;
const ok = (name, cond, extra = '') => { console.log(cond ? 'PASS' : 'FAIL', name, extra); if (!cond) bad++; };
// versus from the menu
{
  const { page, errors, ctx } = await openGame(b, srv.url, 'menu=main&autoplay=nina5&ff=8&half=15', { viewport: { width: 1280, height: 720 } });
  await page.waitForSelector('#s-main'); await page.click('#s-main [data-act=quick]'); await page.waitForSelector('#s-quick');
  await page.click('#players .chip-o[data-i="2"]');
  ok('versus: aparecen los controles del jugador 2', await page.evaluate(() => !!document.querySelector('#c1')));
  await page.click('#kingdoms .card[data-i="3"]'); await page.click('.go');
  await page.waitForFunction(() => window.__futbol.match?.phase, null, { timeout: 10000 });
  const m = await page.evaluate(() => { const m = window.__futbol.match; return { teams: m.humans.map((h) => h.team), humanPlayers: m.players.filter((p) => p.control === 'human').map((p) => p.team), species: m.players.find((p) => p.team === 1).species }; });
  ok('versus: un humano por equipo', JSON.stringify(m.teams) === '[0,1]' && JSON.stringify(m.humanPlayers.sort()) === '[0,1]' && m.species === 'dragon', JSON.stringify(m));
  await page.waitForSelector('#result', { timeout: 120000 });
  const txt = await page.evaluate(() => document.querySelector('#result .msg').textContent);
  ok('versus: el resultado habla de quien gano', /Ganó la Familia|Ganaron los Dragoncitos|Empate/.test(txt), txt);
  ok('versus sin errores', errors.length === 0, errors.join('|'));
  await ctx.close();
}
// practice with Thor
{
  const { page, errors, ctx } = await openGame(b, srv.url, 'menu=main&autoplay=nina5&ff=6', { viewport: { width: 1280, height: 720 } });
  await page.waitForSelector('#s-main'); await page.click('#s-main [data-act=training]'); await page.waitForSelector('#s-training');
  await page.evaluate(() => { window.__futbol.app.cfg.controls = ['easy', 'easy']; });
  await page.click('.go');
  await page.waitForFunction(() => window.__futbol.match?.phase, null, { timeout: 10000 });
  const t = await page.evaluate(() => ({ training: window.__futbol.match.training, panel: !!document.getElementById('training'), clock: document.getElementById('hud').textContent.includes('Entrenamiento') }));
  ok('entrenamiento: modo activo, tarjeta de retos y titulo', t.training && t.panel && t.clock, JSON.stringify(t));
  await page.screenshot({ path: 'docs/qa/shots/m12_entrenamiento.png' });
  await page.waitForFunction(() => /Reto [2-3]/.test(document.getElementById('tn')?.textContent || '') || !!document.getElementById('result'), null, { timeout: 120000 });
  const prog = await page.evaluate(() => document.getElementById('tn').textContent);
  ok('entrenamiento: avanza al siguiente reto al cumplir el primero', /Reto [2-3]|completo/.test(prog), prog);
  ok('entrenamiento: sin cronometro (no termina)', await page.evaluate(() => window.__futbol.match.phase !== 'over'));
  ok('entrenamiento sin errores', errors.length === 0, errors.join('|'));
  await ctx.close();
}
await b.close(); srv.stop();
console.log(bad ? `${bad} FAIL` : 'modes: all passed');
process.exit(bad ? 1 : 0);
