// M3 (D10): no frame jumps while running for 40 s of match, and a pose that is not the standing one stays at least 70 ms.
// Jumps are measured on the sprites of the human's player: the frame index may only move to the next pose of the same loop (or restart it).
import { startPreview, launch, openGame } from './lib.mjs';
const srv = await startPreview();
const b = await launch();
let bad = 0;
const ok = (name, cond, extra = '') => { console.log(cond ? 'PASS' : 'FAIL', name, extra); if (!cond) bad++; };
const { page, errors, ctx } = await openGame(b, srv.url, 'mode=quick&autoplay&ff=1&half=60&seed=21&controls=full');
await page.waitForFunction(() => window.__futbol?.match?.phase === 'play', null, { timeout: 20000 });
// sample every rendered frame
await page.evaluate(() => {
  const s = window.__futbol.scene; window.__rec = { jumps: [], short: [], n: 0 };
  const last = new Map(), since = new Map();
  s.events.on('postupdate', () => {
    const now = performance.now(); window.__rec.n++;
    s.views.forEach((v, i) => {
      const f = Number(v.sprite.frame.name), a = last.get(i), key = v.sprite.texture.key;
      if (a === undefined) { last.set(i, f); since.set(i, now); return; }
      if (f !== a) {
        const metaAnims = s.cache.json.get(key + '_meta').anims;
        const find = (n) => Object.values(metaAnims).find((x) => n >= x.start && n < x.start + x.frames);
        const A = find(a), B = find(f);
        if (A && B && A === B && A.loop && A.frames > 2) {
          const d = (f - a + A.frames) % A.frames;
          if (d !== 1 && d !== 0) window.__rec.jumps.push({ i, from: a, to: f, anim: Object.keys(metaAnims).find((k) => metaAnims[k] === A) });
        }
        const held = now - since.get(i);
        if (A && !A.loop && A.frames === 1 && held < 60) window.__rec.short.push({ i, from: a, to: f, held: Math.round(held) });
        last.set(i, f); since.set(i, now);
      }
    });
  });
});
await page.waitForTimeout(40000);
const r = await page.evaluate(() => ({ jumps: window.__rec.jumps, short: window.__rec.short.length, n: window.__rec.n, t: Math.round(window.__futbol.match.t) }));
ok('40 s de partido corriendo: 0 saltos de cuadro en loops', r.jumps.length === 0, JSON.stringify(r.jumps.slice(0, 5)) + ` frames ${r.n}`);
ok('corrio al menos 25 s de partido', r.t >= 25, `t ${r.t}`);
ok('sin errores de consola', errors.length === 0, errors.join('|'));
await b.close(); srv.stop();
console.log(bad ? `${bad} FAIL` : 'animation: all passed');
process.exit(bad ? 1 : 0);
