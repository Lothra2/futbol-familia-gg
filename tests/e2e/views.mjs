// M3 (D12): the camera at both extremes of the pitch shows no empty edges, at a phone, a laptop and a wide screen. Saves docs/qa/shots/m3_*.png.
import { startPreview, launch, openGame } from './lib.mjs';
const srv = await startPreview();
const b = await launch();
let bad = 0;
const ok = (name, cond, extra = '') => { console.log(cond ? 'PASS' : 'FAIL', name, extra); if (!cond) bad++; };

for (const [w, h, dpr, touch] of [[667, 375, 2, true], [1280, 720, 1, false], [1920, 1080, 1, false]]) {
  const { page, errors, ctx } = await openGame(b, srv.url, 'mode=quick&autoplay=quieto&half=60&seed=31&time=day', { viewport: { width: w, height: h }, deviceScaleFactor: dpr, hasTouch: touch, isMobile: touch });
  await page.waitForFunction(() => window.__futbol?.match?.phase === 'play', null, { timeout: 20000 });
  const size = await page.evaluate(() => ({ w: window.__futbol.game.scale.width, h: window.__futbol.game.scale.height }));
  for (const [name, bx, by] of [['izq', 4, 80], ['der', 956, 80], ['centro', 480, 80]]) {
    await page.evaluate(({ bx, by }) => {
      const m = window.__futbol.match;
      for (const p of m.players) { p.noControlT = 99; p.vx = p.vy = 0; }
      Object.assign(m.ball, { x: bx, y: by, z: 0, vx: 0, vy: 0, vz: 0, state: 'dead', owner: null });
      m.phase = 'play'; m.phaseT = 0;
    }, { bx, by });
    await page.waitForTimeout(1800);
    const r = await page.evaluate(() => new Promise((res) => {
      const g = window.__futbol.game, W = g.scale.width, H = g.scale.height, top = H - 176;
      g.renderer.snapshot((img) => {
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
        const sc = img.width / W;
        const at = (px, py) => { const d = x.getImageData(Math.min(img.width - 1, Math.floor(px * sc)), Math.min(img.height - 1, Math.floor(py * sc)), 1, 1).data; return (d[0] << 16) | (d[1] << 8) | d[2]; };
        const BAD = new Set([0x7bc8f2, 0x9fe3ff, 0xbfefff, 0xddf6ff]);   // the bands of the day sky: they may only show above the stands (the ink of outlines has the colour of the page background, so it cannot be used)
        const rows = { stands: top - 16 - 5, field: top + 80, near: top + 160 + 8 };
        const out = { W, H, empty: {} };
        for (const [k, y] of Object.entries(rows)) { let n = 0; for (let px = 0; px < W; px++) if (BAD.has(at(px, y))) n++; out.empty[k] = n; }
        // below the stands nothing may be bare sky either: scan the whole lower part of the screen
        let sky = 0; for (let py = Math.floor(top - 16); py < H; py += 2) for (let px = 0; px < W; px += 2) if (BAD.has(at(px, py))) sky++;
        out.sky = sky; res(out);
      });
    }));
    ok(`${w}x${h} (${r.W}x${r.H}) camara ${name}: sin bordes vacios`, r.empty.stands === 0 && r.empty.field === 0 && r.empty.near === 0 && r.sky === 0, JSON.stringify(r.empty) + ` sky ${r.sky}`);
    await page.screenshot({ path: `docs/qa/shots/m3_${w}x${h}_${name}.png` });
  }
  ok(`${w}x${h}: sin errores de consola`, errors.length === 0, errors.join('|'));
  await ctx.close();
}
await b.close(); srv.stop();
console.log(bad ? `${bad} FAIL` : 'views: all passed');
process.exit(bad ? 1 : 0);
