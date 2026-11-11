// The second art push: expressive faces, painted backdrops of the powers, second backdrops by hour, trophies and victory posters.
import { startPreview, launch, openGame } from './lib.mjs';
const srv = await startPreview();
const b = await launch();
let bad = 0;
const ok = (name, cond, extra = '') => { console.log(cond ? 'PASS' : 'FAIL', name, extra); if (!cond) bad++; };

// every texture is loaded (and the loader made no failed request: openGame reports every http error)
{
  const { page, errors, ctx } = await openGame(b, srv.url, 'mode=quick&half=60&seed=5&autoplay=quieto');
  await page.waitForFunction(() => window.__futbol?.match, null, { timeout: 20000 });
  const miss = await page.evaluate(() => {
    const t = window.__futbol.scene.textures, keys = [];
    for (const c of ['sophie', 'alana', 'papa', 'mama', 'juandi', 'thor']) keys.push(`caras_${c}`);
    for (const s of ['volcan', 'bosque', 'arrecife', 'nubes']) keys.push(`bg_${s}`, `bg2_${s}`);
    return keys.filter((k) => !t.exists(k));
  });
  ok('caras y segundos fondos cargados', miss.length === 0, miss.join(','));
  for (const f of ['ui/trofeo_copa', 'ui/trofeo_bosque', 'ui/trofeo_volcan', 'cine/win_sophie', 'cine/win_thor']) {
    const r = await page.evaluate(async (u) => (await fetch(u)).status, `assets/${f}.png`);
    ok(`existe assets/${f}.png`, r === 200, String(r));
  }
  ok('sin errores de consola ni de red', errors.length === 0, errors.join('|'));
  await ctx.close();
}

// the hour picked for the match is the light of the pitch (the top view has no painted backdrop: the grade and the night lights change)
for (const [st, time, alt] of [['volcan', 'day', true], ['volcan', 'night', false], ['arrecife', 'night', true], ['arrecife', 'day', false], ['bosque', 'night', true], ['nubes', 'day', true], ['nubes', 'sunset', false]]) {
  const { page, errors, ctx } = await openGame(b, srv.url, `mode=quick&half=60&seed=5&autoplay=quieto&stadium=${st}&time=${time}`);
  await page.waitForFunction(() => window.__futbol?.scene?.stadium, null, { timeout: 20000 });
  const r = await page.evaluate(() => { const s = window.__futbol.scene.stadium; return { time: s.time, world: s.world?.name }; });
  void alt; ok(`${st} a la hora ${time}: la cancha toma esa luz`, r.time === time && !!r.world, JSON.stringify(r));
  if (st === 'arrecife' && time === 'night') await page.screenshot({ path: 'docs/qa/shots/estadio_arrecife_noche.png' });
  if (st === 'volcan' && time === 'day') await page.screenshot({ path: 'docs/qa/shots/estadio_volcan_dia.png' });
  ok(`${st}/${time}: sin errores`, errors.length === 0, errors.join('|'));
  await ctx.close();
}

await b.close(); srv.stop();
console.log(bad ? `\n${bad} failed` : '\nall passed');
process.exit(bad ? 1 : 0);
