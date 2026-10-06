// M7: title, main menu, quick match, Cup, showcase and settings fit the phone, start a match with the chosen options and come back with the pause menu.
import { startPreview, launch, openGame } from './lib.mjs';
const srv = await startPreview();
const b = await launch();
let bad = 0;
const ok = (name, cond, extra = '') => { console.log(cond ? 'PASS' : 'FAIL', name, extra); if (!cond) bad++; };
const inView = (r, w, h) => r && r.left >= -1 && r.top >= -1 && r.right <= w + 1 && r.bottom <= h + 1;
for (const [w, h] of [[667, 375], [844, 390], [926, 428], [1024, 768], [1180, 820], [1280, 720], [1366, 1024]]) {
  const { page, errors, ctx } = await openGame(b, srv.url, '', { viewport: { width: w, height: h }, deviceScaleFactor: w < 1000 ? 2 : 1, hasTouch: w < 1000, isMobile: w < 1000 });
  await page.waitForSelector('#s-title', { timeout: 15000 });
  await page.evaluate(() => { window.__futbol.store.data.stats.guideSeen = true; });   // the tour of the first match has its own test (guide.mjs)
  await page.screenshot({ path: `docs/qa/shots/m7_title_${w}x${h}.png` });
  ok(`${w}x${h}: la portada muestra el titulo y "Toca para empezar"`, await page.evaluate(() => !!document.querySelector('.logo .l1') && !!document.querySelector('.tap')));
  await page.click('#s-title');
  await page.waitForSelector('#s-main');
  const mb = await page.evaluate(() => [...document.querySelectorAll('#s-main .mbtn')].map((e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; }));
  ok(`${w}x${h}: los 5 botones del menu caben`, mb.length === 5 && mb.every((r) => r.l >= 0 && r.t >= 0 && r.r <= w && r.b <= h), JSON.stringify(mb.slice(-1)));
  await page.screenshot({ path: `docs/qa/shots/m7_main_${w}x${h}.png` });
  // every screen opens, has its back button in view and Escape goes back
  for (const act of ['quick', 'cup', 'vitrina', 'settings', 'training', 'daily', 'guide']) {
    await page.click(`#s-main [data-act=${act}]`); await page.waitForSelector(`#s-${act}`);
    const back = await page.evaluate(() => { const r = document.querySelector('.btn.back').getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; });
    ok(`${w}x${h}: ${act} abre y su boton Atras se ve`, inView(back, w, h), JSON.stringify(back));
    if (act === 'quick') {
      const go = await page.evaluate(() => { const r = document.querySelector('.go').getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; });
      ok(`${w}x${h}: "A jugar" se ve sin desplazar`, inView(go, w, h), JSON.stringify(go));
    }
    await page.screenshot({ path: `docs/qa/shots/m7_${act}_${w}x${h}.png` });
    await page.keyboard.press('Escape'); await page.waitForSelector('#s-main');
  }
  // quick match with chosen options: 2 players, easy controls, easy rival, 1:00, Juandi plays and Papa rests, Tiburoncitos
  await page.click('#s-main [data-act=quick]'); await page.waitForSelector('#s-quick');
  await page.click('#players .chip-o[data-i="1"]');
  await page.click('#squad .card[data-i="0"]');
  await page.click('#kingdoms .card[data-i="1"]');
  await page.click('#c0 .chip-o[data-i="0"]'); await page.click('#diff .chip-o[data-i="0"]'); await page.click('#half .chip-o[data-i="0"]');
  await page.click('.go');
  await page.waitForFunction(() => window.__futbol.match?.phase, null, { timeout: 10000 });
  const m = await page.evaluate(() => { const m = window.__futbol.match; const sc = window.__futbol.scene; return { humans: m.humans.length, diff: m.difficulty, half: m.halfLength, controls: m.humans[0].controls, juandi: m.players.some((p) => p.team === 0 && p.charId === 'juandi'), papa: m.players.some((p) => p.team === 0 && p.charId === 'papa'), species: m.players.find((p) => p.team === 1).species, stadium: sc.stadium.theme.name, pause: !document.getElementById('pause').classList.contains('hidden'), menu: !!document.querySelector('.menu2'), menuScene: window.__futbol.game.scene.isActive('Menu') }; });
  ok(`${w}x${h}: A jugar empieza con lo elegido`, m.humans === 2 && m.diff === 'tranquilos' && m.half === 60 && m.controls === 'easy' && m.juandi && !m.papa && m.species === 'tiburon' && /Arrecife/.test(m.stadium) && m.pause && !m.menu && !m.menuScene, JSON.stringify(m));
  await page.evaluate(() => window.__futbol.shell.pauseNow()); await page.waitForTimeout(200);
  const q = await page.locator('#quit').boundingBox();
  ok(`${w}x${h}: Salir al menu cabe en la pausa`, q.y + q.height <= h && q.y >= 0, JSON.stringify(q));
  await page.click('#quit'); await page.waitForSelector('#s-main');
  ok(`${w}x${h}: volver quita la pausa y el partido y vuelve el escenario del menu`, await page.evaluate(() => document.getElementById('pause').classList.contains('hidden') && !document.getElementById('pause-menu') && !window.__futbol.game.scene.isActive('Match') && window.__futbol.game.scene.isActive('Menu')));
  ok(`${w}x${h}: sin errores de consola`, errors.length === 0, errors.join('|'));
  await ctx.close();
}
// settings persist
{
  const { page, errors, ctx } = await openGame(b, srv.url, 'menu=main', { viewport: { width: 1280, height: 720 } });
  await page.waitForSelector('#s-main');
  await page.click('#s-main [data-act=settings]'); await page.waitForSelector('#s-settings');
  await page.click('#cine .chip-o[data-i="2"]'); await page.click('#muted .chip-o[data-i="1"]');
  await page.fill('#music', '30'); await page.dispatchEvent('#music', 'input');
  const s = await page.evaluate(() => JSON.parse(localStorage.getItem('futbol-familia/save')).settings);
  ok('ajustes: se guardan cinematicas, silencio y volumen', s.cinematics === 'off' && s.muted === true && Math.abs(s.music - 0.3) < 0.01, JSON.stringify(s));
  await page.reload(); await page.waitForSelector('#s-main');
  await page.click('#s-main [data-act=settings]'); await page.waitForSelector('#s-settings');
  ok('ajustes: despues de recargar siguen igual', await page.evaluate(() => document.querySelector('#cine .sel').textContent === 'Sin ellas' && document.querySelector('#muted .sel').textContent === 'Silencio' && document.getElementById('music').value === '30'));
  ok('ajustes sin errores', errors.length === 0, errors.join('|'));
  await ctx.close();
}
await b.close(); srv.stop();
console.log(bad ? `${bad} FAIL` : 'menu: all passed');
process.exit(bad ? 1 : 0);
