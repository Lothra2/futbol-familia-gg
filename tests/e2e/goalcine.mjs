// The goal cutscene: shows during the goal phase, ends by itself at 2.8 s and a tap ends it after 1.0 s. Shots in docs/qa/shots/gol_*.png.
import { startPreview, launch, openGame } from './lib.mjs';
const srv = await startPreview();
const b = await launch();
let bad = 0;
const ok = (name, cond, extra = '') => { console.log(cond ? 'PASS' : 'FAIL', name, extra); if (!cond) bad++; };
const score = (team) => `mode=quick&half=60&seed=5&autoplay=quieto&cine=full${team === 1 ? '&squad=papa,mama,juandi,alana' : ''}`;
for (const who of ['family', 'rival']) {
  const { page, errors, ctx } = await openGame(b, srv.url, score(0), { viewport: { width: 1280, height: 720 } });
  await page.waitForFunction(() => window.__futbol?.match?.phase === 'play', null, { timeout: 20000 });
  await page.evaluate((who) => {
    const m = window.__futbol.match, team = who === 'family' ? 0 : 1, gx = team === 0 ? 940 : 20;
    for (const p of m.players) { if (p.role === 'gk') { p.x = gx + (team === 0 ? -150 : 150); p.y = 10; p.noControlT = 99; } }
    const sh = m.players.find((p) => p.team === team && p.role !== 'gk');
    sh.x = gx + (team === 0 ? -40 : 40); sh.y = 80; Object.assign(m.ball, { x: gx + (team === 0 ? -30 : 30), y: 80, z: 0, vx: team === 0 ? 500 : -500, vy: 0, state: 'free', owner: null });
    m.ball.lastTouch = { player: sh.id, team, t: m.t };
  }, who);
  await page.waitForFunction(() => window.__futbol.match.phase === 'goal', null, { timeout: 8000 });
  const marks = [0.05, 0.4, 0.9, 1.3, 1.7, 2.3];
  for (let i = 0; i < marks.length; i++) {
    await page.waitForFunction((f) => { const m = window.__futbol.match; return m.phase !== 'goal' || m.phaseT >= f; }, marks[i], { timeout: 8000 });
    await page.screenshot({ path: `docs/qa/shots/gol_${who}_${i + 1}.png` });
  }
  const act = await page.evaluate(() => window.__futbol.scene.goalCine.active);
  ok(`${who}: la cinemática del gol se dibuja`, act);
  await page.waitForFunction(() => window.__futbol.match.phase !== 'goal', null, { timeout: 8000 });
  ok(`${who}: sin errores de consola`, errors.length === 0, errors.join('|'));
  await ctx.close();
}
// a tap after 1.0 s ends it early
{
  const { page, ctx } = await openGame(b, srv.url, 'mode=quick&half=60&seed=5&cine=full&controls=full', { viewport: { width: 1280, height: 720 } });
  await page.waitForFunction(() => window.__futbol?.match?.phase === 'play', null, { timeout: 20000 });
  await page.evaluate(() => { const m = window.__futbol.match; for (const p of m.players) if (p.role === 'gk') { p.x = 800; p.y = 10; p.noControlT = 99; }
    const sh = m.players.find((p) => p.team === 0 && p.role !== 'gk'); sh.x = 900; sh.y = 80; Object.assign(m.ball, { x: 910, y: 80, z: 0, vx: 500, vy: 0, state: 'free', owner: null }); m.ball.lastTouch = { player: sh.id, team: 0, t: m.t }; });
  await page.waitForFunction(() => window.__futbol.match.phase === 'goal', null, { timeout: 8000 });
  await page.waitForFunction(() => window.__futbol.match.phaseT >= 1.1, null, { timeout: 8000 });
  await page.mouse.click(640, 360);
  const t = await page.evaluate(async () => { const m = window.__futbol.match; await new Promise((r) => setTimeout(r, 400)); return { phase: m.phase }; });
  ok('un toque después de 1 s la termina', t.phase !== 'goal', JSON.stringify(t));
  await ctx.close();
}
await b.close(); srv.stop();
process.exit(bad ? 1 : 0);
