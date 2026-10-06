// M8: the sound is alive and in range: every tune plays and is audible without clipping, the crowd swells on a goal, the jingles play at the end,
// silence mutes everything. Reads the level of the real audio graph (engine.level()).
import { startPreview, launch, openGame } from './lib.mjs';
const srv = await startPreview();
const b = await launch();
let bad = 0;
const ok = (name, cond, extra = '') => { console.log(cond ? 'PASS' : 'FAIL', name, extra); if (!cond) bad++; };
const { page, errors, ctx } = await openGame(b, srv.url, 'menu=main', { viewport: { width: 1280, height: 720 } });
await page.waitForSelector('#s-main');
await page.mouse.click(640, 360).catch(() => {}); await page.evaluate(() => window.__futbol.audio.unlock());
const run = await page.evaluate(() => window.__futbol.audio.running);
ok('el audio arranca despues del primer toque', run);
const meter = (ms) => page.evaluate(async (ms) => { const a = window.__futbol.audio; let peak = 0, sum = 0, n = 0; const t0 = performance.now(); while (performance.now() - t0 < ms) { const v = a.level(); peak = Math.max(peak, v); sum += v; n++; await new Promise((r) => setTimeout(r, 40)); } return { peak, avg: sum / n }; }, ms);
ok('el menu suena la musica del menu', await page.evaluate(() => window.__futbol.audio.current === 'menu'));
const m0 = await meter(1500); ok('musica del menu audible y sin saturar', m0.peak > 0.005 && m0.peak < 0.9, JSON.stringify(m0));
for (const song of ['bosque', 'arrecife', 'nubes', 'volcan']) {
  await page.evaluate((s) => window.__futbol.audio.music(s), song); await page.waitForTimeout(300);
  const m = await meter(1800);
  ok(`${song}: suena, audible y sin saturar`, m.peak > 0.005 && m.peak < 0.9, JSON.stringify(m));
}
// in a match: the tune of the stadium and the crowd; a goal makes the crowd swell
await page.evaluate(() => window.__futbol.audio.music(null)); await page.waitForTimeout(500);
const quiet = await meter(600);
await page.evaluate(() => { window.__futbol.audio.crowd(true); }); await page.waitForTimeout(900);
const murmur = await meter(800);
ok('el publico murmura (hay sonido sin musica)', murmur.avg > quiet.avg && murmur.avg > 0.0015, JSON.stringify({ quiet, murmur }));
await page.evaluate(() => window.__futbol.audio.swell(1, 3)); await page.waitForTimeout(400);
const roar = await meter(900);
ok('un gol hace rugir al publico (mas fuerte que el murmullo)', roar.avg > murmur.avg * 1.5 && roar.peak < 0.9, JSON.stringify(roar));
await page.waitForTimeout(3500);
for (const j of ['win', 'lose', 'draw', 'champion', 'slam', 'impact', 'whoosh', 'goldensting', 'penstart']) {
  await page.evaluate((n) => window.__futbol.audio.play(n), j);
  const m = await meter(500);
  ok(`${j}: suena sin saturar`, m.peak > 0.004 && m.peak < 0.95, JSON.stringify(m));
  await page.waitForTimeout(700);
}
await page.evaluate(() => { const a = window.__futbol.audio; a.setVolumes(0.7, 0.8, true, 0.7); a.play('slam'); a.swell(1, 2); }); await page.waitForTimeout(300);
const muted = await meter(500);
ok('en silencio no suena nada', muted.peak < 0.002, JSON.stringify(muted));
await page.evaluate(() => window.__futbol.audio.setVolumes(0.7, 0.8, false, 0.7));
// a real match plays its own tune and ends with a jingle
await page.evaluate(() => { const a = window.__futbol.app; a.startMatch({ ...a.cfg, stadium: 'arrecife', rival: 'tiburon', autoplay: 'nina5', ff: 6, half: 10 }); });
await page.waitForFunction(() => window.__futbol.match?.phase === 'play', null, { timeout: 15000 });
ok('el partido en el arrecife suena su musica y el publico', await page.evaluate(() => window.__futbol.audio.current === 'arrecife'));
await page.waitForSelector('#result', { timeout: 120000 });
const end = await page.evaluate(() => ({ cur: window.__futbol.audio.current, log: window.__futbol.audio.log.slice(-6) }));
ok('al terminar para la musica y suena el jingle', end.cur === null && end.log.some((n) => ['win', 'lose', 'draw'].includes(n)), JSON.stringify(end));
ok('sin errores de consola', errors.length === 0, errors.join('|'));
await ctx.close(); await b.close(); srv.stop();
console.log(bad ? `${bad} FAIL` : 'audio: all passed');
process.exit(bad ? 1 : 0);
