// M3: input reaches the match. Keyboard 1P and 2P, simulated gamepad, and touch by CDP (all reported as "simulado" in the QA notes).
import { startPreview, launch, openGame } from './lib.mjs';
const srv = await startPreview();
const b = await launch();
let bad = 0;
const ok = (name, cond, extra = '') => { console.log(cond ? 'PASS' : 'FAIL', name, extra); if (!cond) bad++; };
const waitPlay = (page) => page.waitForFunction(() => window.__futbol?.match?.phase === 'play', null, { timeout: 20000 });
const hum = (page, slot = 0) => page.evaluate((slot) => { const m = window.__futbol.match; const p = m.players.find((q) => q.humanSlot === slot); return p ? { id: p.id, x: p.x, y: p.y, vx: p.vx, vy: p.vy, mx: p.input.mx, my: p.input.my, st: p.stamina, shots: m.players.filter((q) => q.team === 0).reduce((a, q) => a + q.stats2.shots, 0), passes: m.players.filter((q) => q.team === 0).reduce((a, q) => a + q.stats2.passes, 0), state: p.state, owner: m.ball.owner } : null; }, slot);
/** Rivals and mates stand still, the ball sits at the feet of the human of slot `slot`, so a press has something to act on. */
const stage = async (page, slot = 0, bx = 400) => { await page.evaluate(({ slot, bx }) => {
  const m = window.__futbol.match; const me = m.players.find((q) => q.humanSlot === slot);
  for (const p of m.players) if (p.id !== me.id) { p.noControlT = 99; p.vx = p.vy = 0; if (p.team === 1) { p.x = 900; p.y = 150; } }
  m.humans.find((h) => h.slot === slot).since = m.t + 10;   // no automatic switch of player while the test acts
  me.noControlT = 0; me.x = bx; me.y = 80; me.stamina = 100;
  Object.assign(m.ball, { x: bx + 6, y: 80, z: 0, vx: 0, vy: 0, vz: 0, state: 'free', owner: null });
}, { slot, bx });
  await page.waitForFunction((slot) => { const m = window.__futbol.match; const me = m.players.find((q) => q.humanSlot === slot); return m.ball.owner === me.id; }, slot, { timeout: 3000 }); };

// 1. keyboard 1P: a movement key, Tiro (J), Pase (K), Sprint (L)
{
  const { page, errors, ctx } = await openGame(b, srv.url, 'mode=quick&half=60&seed=5&controls=full');
  await waitPlay(page);
  await stage(page); await page.waitForTimeout(150);
  await page.keyboard.down('KeyD'); await page.waitForTimeout(400);
  let h = await hum(page); ok('teclado 1P: D mueve', h.mx > 0.9 && h.vx > 10, `mx ${h.mx} vx ${Math.round(h.vx)}`);
  await page.keyboard.down('KeyL'); await page.waitForTimeout(700);
  const h2 = await hum(page); ok('teclado 1P: L (Sprint) gasta aguante', h2.st < 100 && h2.vx > h.vx - 1, `stamina ${h2.st.toFixed(1)}`);
  await page.keyboard.up('KeyL'); await page.keyboard.up('KeyD');
  await stage(page); await page.waitForTimeout(250);
  const s0 = await hum(page);
  await page.keyboard.down('KeyJ'); await page.waitForTimeout(120); await page.keyboard.up('KeyJ'); await page.waitForTimeout(700);
  const s1 = await hum(page); ok('teclado 1P: J (Tiro) patea', s1.shots + s1.passes > s0.shots + s0.passes, `${s0.shots + s0.passes} -> ${s1.shots + s1.passes}`);
  await stage(page); await page.waitForTimeout(250);
  const p0 = await hum(page);
  await page.keyboard.down('KeyK'); await page.waitForTimeout(90); await page.keyboard.up('KeyK'); await page.waitForTimeout(700);
  const p1 = await hum(page); ok('teclado 1P: K (Pase) pasa', p1.passes > p0.passes, `${p0.passes} -> ${p1.passes}`);
  // pause by key and by losing focus
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  ok('Esc pausa', await page.evaluate(() => window.__futbol.scene.paused));
  await page.click('#resume');
  await page.evaluate(() => document.dispatchEvent(Object.assign(new Event('visibilitychange'))));
  ok('sin errores de consola (teclado 1P)', errors.length === 0, errors.join('|'));
  await ctx.close();
}

// 2. keyboard 2P: each player has its own keys
{
  const { page, errors, ctx } = await openGame(b, srv.url, 'mode=quick&players=2&half=60&seed=6&controls=full,full&chars=papa,alana');
  await waitPlay(page);
  await page.evaluate(() => { for (const p of window.__futbol.match.players) { p.noControlT = 99; } });
  await page.keyboard.down('KeyD'); await page.keyboard.down('ArrowLeft'); await page.waitForTimeout(300);
  const a = await hum(page, 0), c = await hum(page, 1);
  ok('teclado 2P: J1 con D a la derecha y J2 con flecha izquierda', a.mx > 0.9 && c.mx < -0.9, `mx ${a.mx} / ${c.mx}`);
  ok('teclado 2P: son dos jugadores distintos', a.id !== c.id);
  await page.keyboard.up('KeyD'); await page.keyboard.up('ArrowLeft');
  ok('sin errores de consola (teclado 2P)', errors.length === 0, errors.join('|'));
  await ctx.close();
}

// 3. simulated gamepad: stick, buttons and the disconnection pauses
{
  const { page, errors, ctx } = await openGame(b, srv.url, 'mode=quick&half=60&seed=7&controls=full', {}, () => {
    const mk = (axes, down = []) => ({ axes, buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: down.includes(i) })) });
    window.__setPad = (axes, down) => { window.__mockPads = [mk(axes, down)]; };
  });
  await waitPlay(page);
  await stage(page); await page.waitForTimeout(150);
  await page.evaluate(() => window.__setPad([1, 0], []));
  await page.waitForTimeout(400);
  const h = await hum(page); ok('mando simulado: el stick mueve', h.mx > 0.9 && h.vx > 10, `mx ${h.mx}`);
  await page.evaluate(() => window.__setPad([0, 0], [0])); await page.waitForTimeout(150);
  await page.evaluate(() => window.__setPad([0, 0], [])); await page.waitForTimeout(500);
  const g = await hum(page); ok('mando simulado: A patea', g.shots + g.passes > 0, `${g.shots + g.passes}`);
  await page.evaluate(() => { window.__mockPads = [null]; }); await page.waitForTimeout(300);
  ok('mando simulado: desconectar pausa', await page.evaluate(() => window.__futbol.scene.paused));
  ok('sin errores de consola (mando)', errors.length === 0, errors.join('|'));
  await ctx.close();
}

// 4. touch 1P (phone): joystick, Tiro, Pase, Sprint, Especial
{
  const { page, errors, ctx } = await openGame(b, srv.url, 'mode=quick&half=60&seed=8&controls=full', { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await waitPlay(page);
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id })) });
  const center = async (sel) => { const r = await page.locator(sel).boundingBox(); return [r.x + r.width / 2, r.y + r.height / 2]; };
  await stage(page); await page.waitForTimeout(150);
  await touch('touchStart', [[120, 300, 1]]); await touch('touchMove', [[190, 300, 1]]); await page.waitForTimeout(400);
  let h = await hum(page); ok('tactil: el joystick mueve', h.mx > 0.5 && h.vx > 10, `mx ${h.mx.toFixed(2)} vx ${Math.round(h.vx)}`);
  const [sx, sy] = await center('.tbtn.sprint');
  await touch('touchStart', [[190, 300, 1], [sx, sy, 2]]); await page.waitForTimeout(700);
  h = await hum(page); ok('tactil: Sprint gasta aguante con el joystick', h.st < 100, `stamina ${h.st.toFixed(1)}`);
  await touch('touchEnd', []); await page.waitForTimeout(100);
  await stage(page); await page.waitForTimeout(250);
  const s0 = await hum(page); const [tx, ty] = await center('.tbtn.shoot');
  await touch('touchStart', [[tx, ty, 3]]); await page.waitForTimeout(120); await touch('touchEnd', []); await page.waitForTimeout(700);
  const s1 = await hum(page); ok('tactil: Tiro patea', s1.shots + s1.passes > s0.shots + s0.passes, `${s0.shots + s0.passes} -> ${s1.shots + s1.passes}`);
  await stage(page); await page.waitForTimeout(250);
  const p0 = await hum(page); const [px, py] = await center('.tbtn.pass');
  await touch('touchStart', [[px, py, 4]]); await page.waitForTimeout(90); await touch('touchEnd', []); await page.waitForTimeout(700);
  const p1 = await hum(page); ok('tactil: Pase pasa', p1.passes > p0.passes, `${p0.passes} -> ${p1.passes}`);
  // special: full bar, near the rival goal, ball at the feet
  await stage(page, 0, 800); await page.evaluate(() => { window.__futbol.match.bar[0] = 100; }); await page.waitForTimeout(250);
  const [ex, ey] = await center('.tbtn.special');
  await touch('touchStart', [[ex, ey, 5]]); await page.waitForTimeout(100); await touch('touchEnd', []); await page.waitForTimeout(600);
  const sp = await page.evaluate(() => ({ used: window.__futbol.match.specialsUsed[0], phase: window.__futbol.match.phase, bar: window.__futbol.match.bar[0] }));
  ok('tactil: Especial lanza el tiro especial', sp.used >= 1 || sp.phase === 'cinematic' || sp.bar < 100, JSON.stringify(sp));
  await page.screenshot({ path: 'docs/qa/shots/m3_touch_844x390.png' });
  ok('sin errores de consola (tactil 1P)', errors.length === 0, errors.join('|'));
  await ctx.close();
}

// 5. touch 2P: four fingers at once (two sticks and two buttons), pause still tappable
{
  const { page, errors, ctx } = await openGame(b, srv.url, 'mode=quick&players=2&half=60&seed=9&controls=full,full&chars=papa,alana', { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await waitPlay(page);
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id })) });
  const box = async (sel, i) => { const r = await page.locator(sel).nth(i).boundingBox(); return [r.x + r.width / 2, r.y + r.height / 2]; };
  const [s0x, s0y] = await box('.tslot.s0 .tbtn.shoot', 0), [s1x, s1y] = await box('.tslot.s1 .tbtn.shoot', 0);
  await touch('touchStart', [[80, 300, 1], [500, 300, 2]]);
  await touch('touchMove', [[140, 300, 1], [440, 300, 2]]);
  await touch('touchStart', [[140, 300, 1], [440, 300, 2], [s0x, s0y, 3], [s1x, s1y, 4]]);
  await page.waitForTimeout(300);
  const r = await page.evaluate(() => ({ f0: window.__futbol.router.frame(0), f1: window.__futbol.router.frame(1), h0: window.__futbol.router.isHeld(0, 'shoot'), h1: window.__futbol.router.isHeld(1, 'shoot'), n: window.__futbol.touch.active }));
  ok('2P tactil: 4 dedos a la vez (2 sticks y 2 botones)', r.n === 4 && r.h0 && r.h1 && r.f0.mx > 0.3 && r.f1.mx < -0.3, JSON.stringify({ n: r.n, mx0: r.f0.mx, mx1: r.f1.mx, h0: r.h0, h1: r.h1 }));
  await touch('touchEnd', []);
  await page.screenshot({ path: 'docs/qa/shots/m3_touch2p_844x390.png' });
  await page.tap('#pause'); await page.waitForTimeout(250);
  ok('2P tactil: la pausa se puede tocar', await page.evaluate(() => window.__futbol.scene.paused));
  ok('sin errores de consola (tactil 2P)', errors.length === 0, errors.join('|'));
  await ctx.close();
}

await b.close(); srv.stop();
console.log(bad ? `${bad} FAIL` : 'input: all passed');
process.exit(bad ? 1 : 0);
