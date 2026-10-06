// M0 smoke (updated for the real match in M3): the game starts with no errors, the layout is crisp, the font loads, keyboard and multitouch (CDP) reach the router,
// and the pause button stays tappable above the touch layer (trap from the Copa).
import { startPreview, launch, openGame } from './lib.mjs';
const srv = await startPreview();
const b = await launch();
let bad = 0;
const ok = (name, cond, extra = '') => { console.log(cond ? 'PASS' : 'FAIL', name, extra); if (!cond) bad++; };
const Q = 'mode=quick&half=60&seed=3';
const dot = (page) => page.evaluate(() => { const s = window.__futbol.scene; const p = s.match.players.find((q) => q.humanSlot === 0); return { x: p.x, y: p.y, vx: p.vx, vy: p.vy, mx: p.input.mx, my: p.input.my, paused: s.paused, steps: s.steps, phase: s.match.phase }; });
const ready = async (page) => { await page.waitForFunction(() => window.__futbol && window.__futbol.ready && window.__futbol.scene?.steps > 0, null, { timeout: 15000 }); await page.waitForFunction(() => window.__futbol.scene.match.phase === 'play', null, { timeout: 15000 }); };

// 1. desktop 1280x720, keyboard
{
  const { page, errors, ctx } = await openGame(b, srv.url, Q);
  const hosts = new Set(); page.on('request', (r) => { if (/^https?:/.test(r.url())) hosts.add(new URL(r.url()).host); });
  await ready(page);
  const info = await page.evaluate(() => ({ canvases: document.querySelectorAll('canvas').length, loading: !!document.getElementById('loading'),
    font: document.fonts.check('16px Pixelify'), w: window.__futbol.game.scale.width, h: window.__futbol.game.scale.height, css: document.querySelector('canvas').style.width }));
  ok('1280x720: un canvas, sin pantalla de carga, fuente cargada', info.canvases === 1 && !info.loading && info.font, JSON.stringify(info));
  ok('1280x720: pantalla logica 426x240 con escala entera x3', info.w === 426 && info.h === 240 && info.css === '1278px', `${info.w}x${info.h} css ${info.css}`);
  await page.keyboard.down('KeyD'); await page.waitForTimeout(500);
  const d1 = await dot(page); await page.keyboard.up('KeyD');
  ok('teclado: D da eje a la derecha y el jugador corre a la derecha', d1.mx > 0.9 && d1.vx > 20, `mx ${d1.mx} vx ${Math.round(d1.vx)}`);
  await page.keyboard.down('KeyS'); await page.waitForTimeout(400);
  const d2 = await dot(page); await page.keyboard.up('KeyS');
  ok('teclado: S mueve en profundidad', d2.my > 0.9 && d2.vy > 10, `my ${d2.my} vy ${Math.round(d2.vy)}`);
  await page.screenshot({ path: 'docs/qa/shots/m0_1280x720.png' });
  await page.keyboard.press('Escape'); await page.waitForTimeout(250);
  const p1 = await dot(page); await page.waitForTimeout(400); const p2 = await dot(page);
  ok('Esc pausa: el tiempo de simulacion se congela y aparece el menu', p1.paused && p2.steps === p1.steps && (await page.locator('#resume').count()) === 1, `steps ${p1.steps} ${p2.steps}`);
  await page.click('#resume'); await page.waitForTimeout(300);
  ok('Seguir jugando reanuda', (await dot(page)).steps > p2.steps);
  await page.evaluate(() => window.dispatchEvent(new Event('blur'))); await page.waitForTimeout(200);
  ok('perder el foco pausa', (await dot(page)).paused);
  await page.click('#resume');
  ok('sin llamadas a otros dominios', [...hosts].every((h) => h.startsWith('localhost')), [...hosts].join(','));
  ok('sin errores de consola (1280x720)', errors.length === 0, errors.join('|'));
  await ctx.close();
}

// 2. phone 844x390 @3 with touch: layout, multitouch, tappable pause
{
  const { page, errors, ctx } = await openGame(b, srv.url, Q, { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  await ready(page);
  const info = await page.evaluate(() => ({ w: window.__futbol.game.scale.width, h: window.__futbol.game.scale.height, touch: document.getElementById('touch').classList.contains('on'), rotate: document.getElementById('rotate').classList.contains('on') }));
  ok('844x390 @3: pantalla logica 633x292 y controles tactiles visibles', info.w === 633 && info.h === 292 && info.touch && !info.rotate, JSON.stringify(info));
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id })) });
  const d0 = await dot(page);
  await touch('touchStart', [[120, 280, 1]]);
  await touch('touchMove', [[190, 280, 1]]);
  await page.waitForTimeout(500);
  const held = await page.evaluate(() => window.__futbol.router.frame(0));
  ok('multitouch: el joystick flotante da un eje a la derecha', held.mx > 0.5, `mx ${held.mx.toFixed(2)}`);
  const sh = await page.locator('.tbtn.shoot').boundingBox();
  await touch('touchStart', [[190, 280, 1], [sh.x + sh.width / 2, sh.y + sh.height / 2, 2]]);
  await page.waitForTimeout(200);
  const both = await page.evaluate(() => ({ f: window.__futbol.router.frame(0), held: window.__futbol.router.isHeld(0, 'shoot'), fingers: window.__futbol.touch.active }));
  ok('multitouch: mover y pulsar Tiro a la vez (2 dedos)', both.held && both.f.mx > 0.5 && both.fingers === 2, JSON.stringify(both));
  await touch('touchEnd', []);
  await page.waitForTimeout(150);
  ok('el jugador respondio al dedo (eje activo o se movio)', both.f.mx > 0.5, `mx ${both.f.mx.toFixed(2)}`);
  await page.screenshot({ path: 'docs/qa/shots/m0_844x390.png' });
  const pb = await page.locator('#pause').boundingBox();
  const top = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.id, { x: pb.x + pb.width / 2, y: pb.y + pb.height / 2 });
  ok('el boton de pausa es lo que se toca (no la capa tactil)', top === 'pause', `elementFromPoint=${top}`);
  await page.tap('#pause'); await page.waitForTimeout(250);
  ok('tocar pausa abre el menu', (await page.locator('#resume').count()) === 1 && (await dot(page)).paused);
  const rb = await page.locator('#resume').boundingBox();
  ok('el menu de pausa cabe en 844x390', rb.y >= 0 && rb.y + rb.height <= 390 && rb.x >= 0 && rb.x + rb.width <= 844, JSON.stringify(rb));
  ok('sin errores de consola (844x390)', errors.length === 0, errors.join('|'));
  await ctx.close();
}

// 3. phone 667x375: the pause menu fits
{
  const { page, errors, ctx } = await openGame(b, srv.url, Q, { viewport: { width: 667, height: 375 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await ready(page);
  await page.tap('#pause'); await page.waitForTimeout(250);
  const box = await page.locator('.panel').boundingBox();
  ok('667x375: el panel de pausa cabe completo', box.x >= 0 && box.y >= 0 && box.x + box.width <= 667 && box.y + box.height <= 375, JSON.stringify(box));
  await page.screenshot({ path: 'docs/qa/shots/m0_667x375_pause.png' });
  ok('sin errores de consola (667x375)', errors.length === 0, errors.join('|'));
  await ctx.close();
}

await b.close(); srv.stop();
console.log(bad ? `${bad} FAIL` : 'smoke: all passed');
process.exit(bad ? 1 : 0);
