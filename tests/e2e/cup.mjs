// M10: the whole Cup from the menu: four kingdoms in order, penalties when tied, trophies and XP saved, the ceremony at the end and the save after a reload.
import { startPreview, launch, openGame } from './lib.mjs';
const srv = await startPreview();
const b = await launch();
let bad = 0;
const ok = (name, cond, extra = '') => { console.log(cond ? 'PASS' : 'FAIL', name, extra); if (!cond) bad++; };
const { page, errors, ctx } = await openGame(b, srv.url, 'menu=main&autoplay=nina5&ff=8&half=20', { viewport: { width: 1280, height: 720 } });
await page.waitForSelector('#s-main');
ok('La Copa dice "4 reinos" al principio', await page.evaluate(() => document.querySelector('#s-main [data-act=cup] em').textContent.includes('4 reinos')));
await page.click('#s-main [data-act=cup]'); await page.waitForSelector('#s-cup');
await page.click('#cdiff .chip-o[data-i="0"]');
await page.click('[data-act=cupnew]');
const order = [], seen = { pens: 0, golden: 0, rematch: 0, matches: 0 };
let champion = false;
for (let i = 0; i < 40 && !champion; i++) {
  await page.waitForFunction(() => window.__futbol.match?.phase, null, { timeout: 15000 });
  const info = await page.evaluate(() => { const m = window.__futbol.match, c = window.__futbol.app.cfg; return { rival: c.rival, cup: c.cup, knockout: c.knockout, stadium: window.__futbol.scene.stadium.theme.name }; });
  if (!order.length || order[order.length - 1] !== info.rival) order.push(info.rival);
  ok(`partido ${i + 1}: es de la Copa y sin empates`, info.cup === true && info.knockout === true, JSON.stringify(info));
  await page.waitForSelector('#result', { timeout: 120000 });
  seen.matches++;
  const r = await page.evaluate(() => { const m = window.__futbol.match; return { pw: m.penWinner, golden: m.golden, score: m.score, hasNext: !!document.getElementById('next'), credits: !!document.getElementById('credits'), tiles: document.querySelectorAll('.xt').length, head: document.querySelector('#result h2').textContent }; });
  if (r.pw !== null) seen.pens++; if (r.golden) seen.golden++;
  if (i === 0) await page.screenshot({ path: 'docs/qa/shots/m10_resultado.png' });
  ok(`partido ${i + 1}: la pantalla de resultado muestra la XP de la familia`, r.tiles >= 5, JSON.stringify(r));
  if (r.credits) { champion = true; await page.screenshot({ path: 'docs/qa/shots/m10_campeones.png' }); break; }
  const won = r.score[0] > r.score[1] || (r.score[0] === r.score[1] && r.pw === 0);
  if (!won) seen.rematch++;
  await page.click('#next');
}
ok('se llega a campeones', champion, JSON.stringify({ order, seen }));
ok('el orden de los reinos es Mapachitos, Tiburoncitos, Buhos, Dragoncitos', JSON.stringify(order.filter((v, i) => i === 0 || v !== order[i - 1])) === JSON.stringify(['mapache', 'tiburon', 'buho', 'dragon']), JSON.stringify(order));
const save = await page.evaluate(() => JSON.parse(localStorage.getItem('futbol-familia/save')));
ok('la Gran Copa y las 4 copas quedan guardadas', save.trophies.copa === 1 && save.trophies.bosque && save.trophies.arrecife && save.trophies.nubes && save.trophies.volcan && !save.cup.active, JSON.stringify(save.trophies));
ok('la familia gano XP y los partidos quedaron contados', Object.values(save.characters).some((c) => c.xp > 0) && save.records.matches === seen.matches, JSON.stringify(save.records));
await page.click('#credits'); await page.waitForSelector('#credits-screen');
await page.click('#cclose'); await page.waitForSelector('#s-main');
await page.reload(); await page.waitForSelector('#s-main');
ok('despues de recargar: "Campeones x1" en La Copa', await page.evaluate(() => document.querySelector('#s-main [data-act=cup] em').textContent.includes('Campeones x1')));
await page.click('#s-main [data-act=vitrina]'); await page.waitForSelector('#s-vitrina');
await page.screenshot({ path: 'docs/qa/shots/m10_vitrina.png' });
ok('la vitrina muestra las 4 copas', await page.evaluate(() => document.querySelectorAll('.tro.got').length === 4));
ok('sin errores de consola', errors.length === 0, errors.join('|'));
console.log('partidos', seen.matches, JSON.stringify(seen));
await ctx.close(); await b.close(); srv.stop();
console.log(bad ? `${bad} FAIL` : 'cup: all passed');
process.exit(bad ? 1 : 0);
