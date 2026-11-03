// The four worlds of the kingdoms seen from above (Nintendo World Cup): each one loads its own pitch, the crowd above the far touchline celebrates
// a goal, the weather of the Waiting Room shows, and the camera follows the ball on both axes without leaving the drawn ground.
// Shots of every world in docs/qa/shots/mundo_*.png.
import { startPreview, launch, openGame } from './lib.mjs';
const srv = await startPreview();
const b = await launch();
let bad = 0;
const ok = (name, cond, extra = '') => { console.log(cond ? 'PASS' : 'FAIL', name, extra); if (!cond) bad++; };
const ready = (page) => page.waitForFunction(() => window.__futbol?.match?.phase === 'play' && window.__futbol.scene.stadium, null, { timeout: 20000 });
const NAMES = { volcan: 'Volcán Dragón', bosque: 'Bosque Arcoíris', arrecife: 'Arrecife Coral', nubes: 'Nube Alta' };

for (const [id, wx] of [['volcan', 'sol'], ['bosque', 'viento'], ['arrecife', 'lluvia'], ['nubes', 'sol']]) {
  for (const [w, h] of [[1280, 720], [667, 375]]) {
    const { page, errors, ctx } = await openGame(b, srv.url, `mode=quick&half=60&seed=7&autoplay=nina5&cine=off&stadium=${id}&weather=${wx}`, { viewport: { width: w, height: h } });
    await ready(page);
    await page.waitForTimeout(1500);
    const s = await page.evaluate(() => { const sc = window.__futbol.scene, m = sc.match; return { name: sc.stadium.world.name, weather: m.weather, wind: m.ball.wind ?? 0, wet: m.ball.wet ?? 1, players: m.players.length, cam: { x: sc.cameras.main.scrollX, y: sc.cameras.main.scrollY } }; });
    ok(`${id} ${w}x${h}: carga su mundo con 12 jugadores`, s.name === NAMES[id] && s.players === 12, JSON.stringify(s));
    ok(`${id} ${w}x${h}: el clima ${wx} llega al balón`, wx === 'lluvia' ? s.wet > 1 : wx === 'viento' ? s.wind !== 0 : s.wet === 1 && s.wind === 0, JSON.stringify(s));
    await page.screenshot({ path: `docs/qa/shots/mundo_${id}_${w}x${h}.png` });
    if (w === 1280) {
      // a goal: the crowd of the stands goes to its cheer
      const r = await page.evaluate(() => new Promise((res) => {
        const sc = window.__futbol.scene, m = sc.match, t0 = performance.now();
        Object.assign(m.ball, { x: 968, y: 200, z: 6, vx: 0, vy: 0, vz: 0, inNet: true, scored: 0, state: 'free', owner: null });
        const tick = () => { const st = sc.stadium.crowdState; if (st === 'cheer') res({ ms: performance.now() - t0, st }); else if (performance.now() - t0 > 3000) res({ ms: -1, st }); else requestAnimationFrame(tick); };
        requestAnimationFrame(tick);
      }));
      ok(`${id}: el público celebra el gol enseguida`, r.ms >= 0 && r.ms < 500, JSON.stringify(r));
    }
    // the camera follows the ball on both axes and stays on the drawn ground
    const c = await page.evaluate(async () => {
      const sc = window.__futbol.scene, m = sc.match, cam = sc.cameras.main, out = [];
      for (const [x, y] of [[40, 30], [920, 370], [480, 200]]) {
        Object.assign(m.ball, { x, y, z: 0, vx: 0, vy: 0, vz: 0, state: 'free', owner: null, inNet: false, scored: null });
        await new Promise((r) => setTimeout(r, 900));
        out.push({ x: Math.round(cam.scrollX), y: Math.round(cam.scrollY), w: cam.width, h: cam.height });
      }
      return out;
    });
    ok(`${id} ${w}x${h}: la cámara se mueve en los dos ejes`, c[0].x < c[1].x && c[0].y < c[1].y, JSON.stringify(c));
    ok(`${id} ${w}x${h}: sin errores de consola`, errors.length === 0, errors.join('|'));
    await ctx.close();
  }
}
await b.close(); srv.stop();
console.log(bad ? `${bad} FAIL` : 'mundos: all passed');
process.exit(bad ? 1 : 0);
