// The guide of controls: the screen (keyboard, touch, tips) fits every device, the tour of the first match pauses the game and is shown once, the pause menu opens the guide.
import { startPreview, launch, openGame } from './lib.mjs';
const srv = await startPreview();
const b = await launch();
let bad = 0;
const ok = (name, cond, extra = '') => { console.log(cond ? 'PASS' : 'FAIL', name, extra); if (!cond) bad++; };
const inView = (r, w, h) => r && r.left >= -1 && r.top >= -1 && r.right <= w + 1 && r.bottom <= h + 1;
const box = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; }, sel);

// the screen, on a desktop and on touch devices
for (const [w, h, touch] of [[1280, 720, false], [667, 375, true], [844, 390, true], [1180, 820, true]]) {
  const { page, errors, ctx } = await openGame(b, srv.url, 'menu=main', { viewport: { width: w, height: h }, deviceScaleFactor: touch ? 2 : 1, hasTouch: touch, isMobile: touch });
  await page.waitForSelector('#s-main');
  await page.click('#s-main [data-act=guide]'); await page.waitForSelector('#s-guide');
  const first = await page.evaluate(() => document.querySelector('#gtabs .sel').dataset.tab);
  ok(`${w}x${h}: abre en la pestana ${touch ? 'tactil' : 'teclado'}`, first === (touch ? 'tactil' : 'teclado'), first);
  for (const tab of ['teclado', 'tactil', 'trucos']) {
    await page.click(`#gtabs [data-tab=${tab}]`); await page.waitForTimeout(100);
    const bb = await box(page, '.gbody');
    const over = await page.evaluate(() => { const e = document.querySelector('.gwrap'); return e.scrollWidth - e.clientWidth; });
    ok(`${w}x${h}: ${tab} cabe a lo ancho`, inView({ left: bb.left, right: bb.right, top: 0, bottom: 0 }, w, h) && over <= 1, JSON.stringify({ bb, over }));
    if (tab === 'teclado') {
      await page.click('#gk [data-two="1"]');
      const n = await page.evaluate(() => document.querySelectorAll('.board').length);
      ok(`${w}x${h}: 2 jugadores dibuja 2 teclados`, n === 2, String(n));
      await page.click('#gk [data-two="0"]');
    }
    if (tab === 'tactil') {
      const full = await page.evaluate(() => document.querySelectorAll('.phone .tb').length);
      await page.click('#gt [data-easy="1"]');
      const easy = await page.evaluate(() => document.querySelectorAll('.phone .tb').length);
      ok(`${w}x${h}: controles faciles tiene menos botones (${full} a ${easy})`, easy === 3 && full === 5, `${full} ${easy}`);
      await page.click('#gt [data-easy="0"]');
    }
    await page.screenshot({ path: `docs/qa/shots/guia_${tab}_${w}x${h}.png` });
  }
  const back = await box(page, '.btn.back'), go = await box(page, '.go');
  ok(`${w}x${h}: Atras y Jugar un partido se ven`, inView(back, w, h) && inView(go, w, h), JSON.stringify({ back, go }));
  await page.keyboard.press('Escape'); await page.waitForSelector('#s-main');
  ok(`${w}x${h}: sin errores`, errors.length === 0, errors.join('|'));
  await ctx.close();
}

// the tour of the first match: pauses, 4 steps, once
{
  const { page, errors, ctx } = await openGame(b, srv.url, 'menu=main', { viewport: { width: 1280, height: 720 } });
  await page.waitForSelector('#s-main'); await page.click('#s-main [data-act=quick]'); await page.waitForSelector('#s-quick'); await page.click('.go');
  await page.waitForSelector('#coach');
  const t0 = await page.evaluate(() => window.__futbol.match.tick); await page.waitForTimeout(700);
  const t1 = await page.evaluate(() => window.__futbol.match.tick);
  ok('el tour pausa el partido', t1 === t0, `${t0} ${t1}`);
  const steps = await page.evaluate(() => document.querySelector('.cstep').textContent);
  ok('el tour tiene 4 pasos con controles completos', /1 de 4/.test(steps), steps);
  await page.screenshot({ path: 'docs/qa/shots/guia_tour_1.png' });
  for (let i = 0; i < 3; i++) await page.click('#cnext');
  const last = await page.evaluate(() => document.querySelector('#cnext').textContent);
  ok('el ultimo paso dice A jugar', /jugar/.test(last), last);
  await page.screenshot({ path: 'docs/qa/shots/guia_tour_4.png' });
  await page.click('#cnext');
  await page.waitForTimeout(800);
  const t2 = await page.evaluate(() => ({ tick: window.__futbol.match.tick, coach: !!document.getElementById('coach'), seen: JSON.parse(localStorage.getItem('futbol-familia/save')).stats.guideSeen }));
  ok('al terminar el partido sigue y queda guardado', t2.tick > t1 && !t2.coach && t2.seen, JSON.stringify(t2));
  // pause menu opens the guide
  await page.evaluate(() => window.__futbol.shell.pauseNow()); await page.waitForSelector('#pause-menu');
  await page.click('#guide'); await page.waitForSelector('#guide-window');
  ok('la pausa abre la guia', await page.evaluate(() => !!document.querySelector('#guide-window #gtabs')));
  await page.click('#gclose');
  ok('cerrar la guia vuelve a la pausa', await page.evaluate(() => !document.getElementById('guide-window') && !!document.getElementById('pause-menu')));
  await page.click('#resume');
  // second match: no tour
  await page.evaluate(() => window.__futbol.app.showMenu('main')); await page.waitForSelector('#s-main');
  await page.click('#s-main [data-act=quick]'); await page.waitForSelector('#s-quick'); await page.click('.go');
  await page.waitForFunction(() => window.__futbol.match?.phase, null, { timeout: 10000 }); await page.waitForTimeout(600);
  ok('la segunda partida ya no muestra el tour', await page.evaluate(() => !document.getElementById('coach')));
  ok('el tour sin errores', errors.length === 0, errors.join('|'));
  await ctx.close();
}
// the tour with easy controls on a touch device: 3 steps, skip works
{
  const { page, errors, ctx } = await openGame(b, srv.url, 'menu=main', { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await page.waitForSelector('#s-main'); await page.click('#s-main [data-act=quick]'); await page.waitForSelector('#s-quick');
  await page.click('#c0 .chip-o[data-i="0"]'); await page.click('.go');
  await page.waitForSelector('#coach');
  const s = await page.evaluate(() => ({ step: document.querySelector('.cstep').textContent, phone: !!document.querySelector('#coach .phone'), fits: (() => { const r = document.querySelector('.cpanel').getBoundingClientRect(); return r.bottom <= innerHeight + 1 && r.top >= -1; })() }));
  ok('tactil y fáciles: 3 pasos, dibuja el telefono y cabe en 844x390', /1 de 3/.test(s.step) && s.phone && s.fits, JSON.stringify(s));
  await page.screenshot({ path: 'docs/qa/shots/guia_tour_tactil.png' });
  await page.click('#cskip'); await page.waitForTimeout(300);
  ok('Saltar guia la cierra y reanuda', await page.evaluate(() => !document.getElementById('coach') && !window.__futbol.scene.paused));
  ok('sin errores', errors.length === 0, errors.join('|'));
  await ctx.close();
}
await b.close(); srv.stop();
console.log(bad ? `${bad} FAIL` : 'guide: all passed');
process.exit(bad ? 1 : 0);
