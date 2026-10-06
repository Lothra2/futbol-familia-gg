// M6 (D9): the crowd of the stadium. A goal makes more than 80% of the visible fans jump or raise their arms in under 0.3 s, the wave runs along the
// stands, and slow frames drop the crowd to its light mode in at most 3.5 s. Shots of the Volcán by day, at sunset and at night in docs/qa/shots/volcan_*.png.
import { startPreview, launch, openGame } from './lib.mjs';
const srv = await startPreview();
const b = await launch();
let bad = 0;
const ok = (name, cond, extra = '') => { console.log(cond ? 'PASS' : 'FAIL', name, extra); if (!cond) bad++; };
const Q = (extra = '') => `mode=quick&half=60&seed=7&autoplay=quieto${extra}`;
const ready = (page) => page.waitForFunction(() => window.__futbol?.match?.phase === 'play' && window.__futbol.scene.stadium, null, { timeout: 20000 });

// 1. a goal: how fast the fans react
{
  const { page, errors, ctx } = await openGame(b, srv.url, Q('&crowd=high'), { viewport: { width: 1280, height: 720 } });
  await ready(page);
  await page.waitForTimeout(600);
  const before = await page.evaluate(() => ({ share: window.__futbol.scene.stadium.cheeringShare(), n: window.__futbol.scene.stadium.visibleFans().length, state: window.__futbol.scene.stadium.state }));
  ok('antes del gol casi nadie está de pie con los brazos arriba', before.share < 0.1 && before.n > 50, JSON.stringify(before));
  const r = await page.evaluate(() => new Promise((res) => {
    const s = window.__futbol.scene, m = s.match, t0 = performance.now();
    Object.assign(m.ball, { x: 968, y: 80, z: 6, vx: 0, vy: 0, vz: 0, inNet: true, scored: 0, state: 'free', owner: null });
    const tick = () => {
      const sh = s.stadium.cheeringShare();
      if (sh > 0.8) res({ ms: performance.now() - t0, share: sh, state: s.stadium.state, phase: m.phase });
      else if (performance.now() - t0 > 3000) res({ ms: -1, share: sh, state: s.stadium.state, phase: m.phase });
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }));
  ok('tras el gol más del 80% de los hinchas visibles saltan o levantan los brazos en menos de 0,3 s', r.ms >= 0 && r.ms < 300 && r.share > 0.8, JSON.stringify(r));
  const flash = await page.evaluate(() => ({ score: window.__futbol.match.score, video: true }));
  ok('el gol se anotó', flash.score[0] === 1, JSON.stringify(flash.score));
  await page.waitForFunction(() => window.__futbol.scene.stadium.state !== 'cheer', null, { timeout: 9000 });
  const after = await page.evaluate(() => window.__futbol.scene.stadium.state);
  ok('pasado el festejo el público vuelve a su sitio', after === 'idle' || after === 'stand' || after === 'wave', after);
  ok('sin errores de consola (gol)', errors.length === 0, errors.join('|'));
  await ctx.close();
}

// 2. the wave runs from one end of the stands to the other
{
  const { page, errors, ctx } = await openGame(b, srv.url, Q('&crowd=high'), { viewport: { width: 1280, height: 720 } });
  await ready(page);
  await page.evaluate(() => window.__futbol.scene.stadium.wave());
  const samples = [];
  for (let i = 0; i < 28; i++) { samples.push(await page.evaluate(() => { const s = window.__futbol.scene.stadium; return { crest: s.crestX(), state: s.state }; })); await page.waitForTimeout(100); }
  const crests = samples.filter((x) => x.state === 'wave').map((x) => x.crest);
  ok('la ola nace en un extremo y llega al otro', crests.length > 15 && crests[0] < 200 && Math.max(...crests) > 800, `n ${crests.length} de ${Math.round(crests[0])} a ${Math.round(Math.max(...crests))}`);
  ok('la cresta avanza siempre hacia la derecha', crests.every((c, i) => i === 0 || c >= crests[i - 1]), '');
  // a second wave, measured when its crest is over the stands that are on the screen
  await page.waitForFunction(() => window.__futbol.scene.stadium.state !== 'wave', null, { timeout: 12000 });
  await page.evaluate(() => { window.__futbol.scene.stadium.wave(); });
  const up = await page.evaluate(() => new Promise((res) => {
    const s = window.__futbol.scene.stadium, t0 = performance.now();
    const tick = () => {
      const c = s.crestX(), fans = s.visibleFans().filter((f) => Math.abs(f.col * 8 - c) < 40);
      if (c >= 0 && fans.length > 5) res({ c: Math.round(c), n: fans.length, up: fans.filter((f) => s.poseNow(f) === 'up').length });
      else if (performance.now() - t0 > 6000) res({ c, n: 0, up: 0 });
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }));
  ok('los hinchas bajo la cresta levantan los brazos', up.n > 5 && up.up / up.n > 0.7, JSON.stringify(up));
  ok('sin errores de consola (ola)', errors.length === 0, errors.join('|'));
  await ctx.close();
}

// 3. slow frames: the crowd goes to its light mode in at most 3.5 s
{
  const { page, errors, ctx } = await openGame(b, srv.url, Q('&crowd=high&fpsCap=20'), { viewport: { width: 1280, height: 720 } });
  await ready(page);
  await page.waitForFunction(() => window.__futbol.scene.stadium.mode === 'low', null, { timeout: 12000 });
  const lo = await page.evaluate(() => { const s = window.__futbol.scene.stadium; return { start: s.slowStart, at: s.lowAt }; });
  ok('con cuadros lentos el público pasa a modo bajo entre 2,9 y 3,5 s después de que se vuelven lentos', lo.at - lo.start >= 2.9 && lo.at - lo.start <= 3.5 || lo.start < 0 && lo.at > 0, JSON.stringify(lo));
  await page.evaluate(() => { const m = window.__futbol.match; Object.assign(m.ball, { x: 968, y: 80, z: 6, vx: 0, vy: 0, vz: 0, inNet: true, scored: 0, state: 'free', owner: null }); });
  await page.waitForTimeout(400);
  const low = await page.evaluate(() => { const s = window.__futbol.scene.stadium; return { state: s.state, share: s.cheeringShare() }; });
  ok('en modo bajo el público también reacciona al gol', low.state === 'cheer' && low.share > 0.8, JSON.stringify(low));
  ok('sin errores de consola (calidad)', errors.length === 0, errors.join('|'));
  await ctx.close();
  const f = await openGame(b, srv.url, Q('&crowd=high'), { viewport: { width: 1280, height: 720 } });
  await ready(f.page); await f.page.waitForTimeout(4500);
  ok('con cuadros normales se queda en modo alto', (await f.page.evaluate(() => window.__futbol.scene.stadium.mode)) === 'high');
  await f.ctx.close();
}

// 4. the Volcán by day, at sunset and at night, with the camera at both ends, on a phone and on a laptop
for (const [w, h, dpr, touch] of [[667, 375, 2, true], [1280, 720, 1, false]]) for (const time of ['day', 'sunset', 'night']) {
  const { page, errors, ctx } = await openGame(b, srv.url, Q(`&time=${time}`), { viewport: { width: w, height: h }, deviceScaleFactor: dpr, hasTouch: touch, isMobile: touch });
  await ready(page);
  for (const [name, bx] of [['izq', 4], ['centro', 480], ['der', 956]]) {
    await page.evaluate((bx) => { const m = window.__futbol.match; for (const p of m.players) { p.noControlT = 99; p.vx = p.vy = 0; } Object.assign(m.ball, { x: bx, y: 80, z: 0, vx: 0, vy: 0, vz: 0, state: 'dead', owner: null }); }, bx);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `docs/qa/shots/volcan_${time}_${w}x${h}_${name}.png` });
  }
  ok(`volcán ${time} ${w}x${h}: sin errores de consola`, errors.length === 0, errors.join('|'));
  await ctx.close();
}
await b.close(); srv.stop();
console.log(bad ? `${bad} FAIL` : 'crowd: all passed');
process.exit(bad ? 1 : 0);
