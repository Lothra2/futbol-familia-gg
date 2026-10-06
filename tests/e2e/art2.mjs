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
    for (const k of ['arcoiris', 'burbuja', 'canonazo', 'estrellas', 'carrera', 'relampago', 'llamarada', 'ola', 'picada', 'hojas']) keys.push(`cine_fx_${k}`);
    for (const s of ['volcan', 'bosque', 'arrecife', 'nubes']) keys.push(`bg_${s}`, `bg2_${s}`);
    return keys.filter((k) => !t.exists(k));
  });
  ok('caras, fondos de poderes y segundos fondos cargados', miss.length === 0, miss.join(','));
  for (const f of ['ui/trofeo_copa', 'ui/trofeo_bosque', 'ui/trofeo_volcan', 'cine/win_sophie', 'cine/win_thor']) {
    const r = await page.evaluate(async (u) => (await fetch(u)).status, `assets/${f}.png`);
    ok(`existe assets/${f}.png`, r === 200, String(r));
  }
  ok('sin errores de consola ni de red', errors.length === 0, errors.join('|'));
  await ctx.close();
}

// the second backdrop is used exactly at its hour
for (const [st, time, alt] of [['volcan', 'day', true], ['volcan', 'night', false], ['arrecife', 'night', true], ['arrecife', 'day', false], ['bosque', 'night', true], ['nubes', 'day', true], ['nubes', 'sunset', false]]) {
  const { page, errors, ctx } = await openGame(b, srv.url, `mode=quick&half=60&seed=5&autoplay=quieto&stadium=${st}&time=${time}`);
  await page.waitForFunction(() => window.__futbol?.scene?.stadium, null, { timeout: 20000 });
  const r = await page.evaluate(() => { const s = window.__futbol.scene.stadium; return { alt: s.altArt, key: s.bgImg?.texture?.key }; });
  ok(`${st} a la hora ${time}: ${alt ? 'fondo alterno' : 'fondo normal'}`, r.alt === alt && (r.key === (alt ? `bg2_${st}` : `bg_${st}`)), JSON.stringify(r));
  if (st === 'arrecife' && time === 'night') await page.screenshot({ path: 'docs/qa/shots/estadio_arrecife_noche.png' });
  if (st === 'volcan' && time === 'day') await page.screenshot({ path: 'docs/qa/shots/estadio_volcan_dia.png' });
  ok(`${st}/${time}: sin errores`, errors.length === 0, errors.join('|'));
  await ctx.close();
}

// the cinematic paints the backdrop of the power in the ball phase and the face of the shooter at the end
for (const who of ['sophie', 'thor', 'papa']) {
  const { page, errors, ctx } = await openGame(b, srv.url, `mode=quick&half=60&seed=5&forceSpecial=${who}&autoplay=quieto&cine=full`);
  await page.waitForFunction(() => window.__futbol?.match?.phase === 'cinematic', null, { timeout: 20000 });
  await page.evaluate(() => {
    const s = window.__futbol.scene; window.__fx = { fx: 0, face: 0, badScale: 0, fxKey: null, faceKey: null };
    s.events.on('postupdate', () => {
      const c = s.cine, w = window.__fx;
      if (c.fxImg.visible) { w.fx++; w.fxKey = c.fxImg.texture.key; if (!Number.isInteger(c.fxImg.scaleX)) w.badScale++; }
      if (c.face.visible) { w.face++; w.faceKey = c.face.texture.key; if (!Number.isInteger(c.face.scaleX)) w.badScale++; }
    });
  });
  await page.waitForFunction(() => window.__futbol.match.phase !== 'cinematic', null, { timeout: 12000 });
  const r = await page.evaluate(() => window.__fx);
  ok(`${who}: el panel del vuelo muestra la pintura del poder`, r.fx > 10 && /^cine_fx_/.test(r.fxKey || ''), JSON.stringify(r));
  ok(`${who}: la cara del tirador reacciona al final`, r.face > 5 && /^caras_/.test(r.faceKey || ''), JSON.stringify(r));
  ok(`${who}: ambas a escala entera`, r.badScale === 0);
  ok(`${who}: sin errores`, errors.length === 0, errors.join('|'));
  await ctx.close();
}

await b.close(); srv.stop();
console.log(bad ? `\n${bad} failed` : '\nall passed');
process.exit(bad ? 1 : 0);
