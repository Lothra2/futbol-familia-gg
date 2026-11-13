// The Nekketsu of the eleventh round: the celebration of a goal is played (the buttons are gestures and SEGUIR goes on), the captain never
// changes player and orders his mates about, la palomita, and the VS screen with the trip of the plane and the crests of the teams.
// Shots in docs/qa/shots/nk3_*.png.
import { startPreview, launch, openGame } from './lib.mjs';
const srv = await startPreview();
const b = await launch();
let bad = 0;
const ok = (name, cond, extra = '') => { console.log(cond ? 'PASS' : 'FAIL', name, extra); if (!cond) bad++; };
const key = async (page, k, ms = 70) => { await page.keyboard.down(k); await page.waitForTimeout(ms); await page.keyboard.up(k); };
const PHONE = { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 };
const me = (page) => page.evaluate(() => { const m = window.__futbol.match, p = m.players.find((q) => q.humanSlot === 0); return { id: p.id, char: p.charId, x: p.x, y: p.y, z: p.z, state: p.state, move: p.cele?.move ?? null, free: !!p.cele?.free, phase: m.phase, phaseT: m.phaseT, owner: m.ball.owner }; });
/** The player of the person scores right now. */
const score = (page) => page.evaluate(() => {
  const m = window.__futbol.match, p = m.players.find((q) => q.humanSlot === 0);
  p.x = 840; p.y = 200; Object.assign(m.ball, { state: 'free', owner: null, x: 964, y: 200, z: 5, vx: 0, vy: 0, vz: 0, inNet: true, scored: 0 });
  m.ball.lastTouch = { team: 0, player: p.id, t: m.t };
});

// 1. the celebration is played
{
  const { page, errors, ctx } = await openGame(b, srv.url, 'mode=quick&half=60&seed=5&controls=full&cine=off', PHONE);
  await page.waitForFunction(() => window.__futbol?.match?.phase === 'play', null, { timeout: 20000 });
  await score(page);
  await page.waitForFunction(() => window.__futbol.match.phase === 'goal' && window.__futbol.match.phaseT > 0.45, null, { polling: 'raf' });
  // (if the press catches him in the air of his own jump, the gesture waits for the landing)
  await key(page, 'KeyJ', 90); await page.waitForFunction(() => { const q = window.__futbol.match.players.find((r) => r.humanSlot === 0); return q.cele?.move === 'pump' && q.z > 2; }, null, { timeout: 2500, polling: 'raf' }).catch(() => {});
  const a = await me(page); ok('celebración: Tiro salta con el puño', a.move === 'pump' && a.free && a.z > 0, JSON.stringify(a));
  await page.screenshot({ path: 'docs/qa/shots/nk3_celebra_salto.png' });
  await page.waitForFunction(() => { const p = window.__futbol.match.players.find((q) => q.humanSlot === 0); return p.z <= 0; });
  await key(page, 'KeyK'); await page.waitForTimeout(250);
  const w = await me(page); ok('celebración: Pase saluda', w.move === 'wave', JSON.stringify(w));
  await page.waitForTimeout(700);
  await key(page, 'KeyI'); await page.waitForTimeout(350);
  const p3 = await me(page); ok('celebración: Especial posa a la cámara', p3.move === 'burla', JSON.stringify(p3));
  await page.screenshot({ path: 'docs/qa/shots/nk3_celebra_pose.png' });
  await page.waitForTimeout(700);
  const x0 = (await me(page)).x;
  await page.keyboard.down('KeyA'); await page.waitForTimeout(600); await page.keyboard.up('KeyA');
  const w2 = await me(page); ok('celebración: el stick lo pasea', w2.x < x0 - 15 && w2.phase === 'goal', `${x0.toFixed(0)} -> ${w2.x.toFixed(0)} ${w2.phase}`);
  ok('celebración: sigue pasados los 2,8 s de siempre mientras ella celebra', w2.phaseT > 2.8, `phaseT ${w2.phaseT.toFixed(2)}`);
  const goon = await page.evaluate(() => { const el = document.getElementById('goon'), r = el.getBoundingClientRect(); return { show: el.classList.contains('show'), x: r.x, y: r.y, w: r.width, h: r.height }; });
  ok('celebración: el botón SEGUIR está en pantalla', goon.show && goon.w > 30 && goon.x + goon.w <= 844 && goon.y > 40, JSON.stringify(goon));
  await page.click('#goon'); await page.waitForTimeout(250);
  const end = await me(page); ok('celebración: SEGUIR vuelve al partido', end.phase !== 'goal', end.phase);
  ok('celebración sin errores', errors.length === 0, errors.join('|'));
  await ctx.close();
}

// 2. the captain and his orders
{
  const { page, errors, ctx } = await openGame(b, srv.url, 'mode=quick&half=60&seed=5&controls=full&chars=sophie&cine=off&captain=1', PHONE);
  await page.waitForFunction(() => window.__futbol?.match?.phase === 'play', null, { timeout: 20000 });
  const who = (await me(page)).id;
  await page.evaluate(() => {
    const m = window.__futbol.match, p = m.players.find((q) => q.humanSlot === 0), papa = m.players.find((q) => q.charId === 'papa');
    for (const q of m.players) if (q.team === 1 && q.role !== 'gk') { q.x = 900; q.y = 380; }
    p.x = 620; p.y = 250; papa.x = 500; papa.y = 160; Object.assign(m.ball, { x: 508, y: 160, z: 0, vx: 0, vy: 0, vz: 0, state: 'owned', owner: papa.id });
    window.__ev = []; const sc = window.__futbol.scene, pow = sc.pow.bind(sc); sc.pow = (x, y, word, ...rest) => { window.__ev.push(word); return pow(x, y, word, ...rest); };
  });
  await page.waitForTimeout(250);
  const c0 = await me(page); ok('capitán: con un compañero en el balón sigo siendo el mismo jugador', c0.id === who && c0.owner !== who, JSON.stringify(c0));
  await key(page, 'KeyK'); await page.waitForTimeout(150);
  await page.screenshot({ path: 'docs/qa/shots/nk3_orden_pasala.png' });
  await page.waitForFunction((id) => window.__futbol.match.ball.owner === id, who, { timeout: 4000 }).catch(() => {});
  const c1 = await me(page); ok('capitán: Pase es ¡PÁSALA! y el compañero me la da', c1.owner === who && c1.id === who, JSON.stringify(c1));
  // far from the ball, with a rival on it: the arrow of the edge and ¡QUÍTASELA!
  await page.evaluate(() => { const m = window.__futbol.match, p = m.players.find((q) => q.humanSlot === 0), r = m.players.find((q) => q.team === 1 && q.slot === 3), papa = m.players.find((q) => q.charId === 'papa'); p.x = 110; p.y = 60; papa.x = 520; papa.y = 300; r.x = 700; r.y = 200; r.noControlT = 0; for (const q of m.players) if (q.team === 0 && q.role !== 'gk' && q.id !== p.id && q.id !== papa.id) { q.x = 150; q.y = 330; } Object.assign(m.ball, { x: 692, y: 200, z: 0, state: 'owned', owner: r.id }); });
  await page.waitForTimeout(220);   // (soon: left alone, the mate would take the ball off him by himself)
  const arrow = await page.evaluate(() => window.__futbol.scene.aim.who.visible);
  ok('capitán: fuera de la pantalla, una flecha dice dónde estoy', arrow === true);
  await key(page, 'KeyJ'); await page.waitForTimeout(200);
  await page.screenshot({ path: 'docs/qa/shots/nk3_orden_quitasela.png' });
  const ev = await page.evaluate(() => window.__ev);
  ok('capitán: los gritos salieron (¡PÁSALA! y ¡QUÍTASELA!) y el compañero contestó', ev.includes('¡PÁSALA!') && ev.includes('¡TOMA!') && ev.includes('¡QUÍTASELA!') && ev.includes('¡VOY!'), JSON.stringify(ev));
  const c2 = await me(page); ok('capitán: nunca cambió de jugador', c2.id === who, JSON.stringify(c2));
  ok('capitán sin errores', errors.length === 0, errors.join('|'));
  await ctx.close();
}

// 3. la palomita (nobody else moves and the traps of the pitch are taken away: no rival and no geyser in his run)
{
  const { page, errors, ctx } = await openGame(b, srv.url, 'mode=quick&half=60&seed=5&controls=full&cine=off', { viewport: { width: 1280, height: 720 } });
  await page.waitForFunction(() => window.__futbol?.match?.phase === 'play', null, { timeout: 20000 });
  await page.evaluate(() => { const m = window.__futbol.match, p = m.players.find((q) => q.humanSlot === 0); for (const q of m.players) if (q.id !== p.id && q.role !== 'gk') { q.noControlT = 99; q.x = 200; q.y = 380; } m.humans[0].since = m.t + 30; m.lastPass = null; m.hazards.length = 0; m.ai = 'none'; for (const q of m.players) if (q.id !== p.id) q.input = { ...q.input, mx: 0, my: 0, shootPressed: false, passPressed: false, sprint: false }; p.x = 600; p.y = 200; p.facing = 1; Object.assign(m.ball, { x: 100, y: 20, z: 0, vx: 0, vy: 0, vz: 0, state: 'free', owner: null }); });
  await page.keyboard.down('KeyD'); await page.keyboard.down('KeyL');
  await page.waitForFunction(() => { const p = window.__futbol.match.players.find((q) => q.humanSlot === 0); return p.vx > 110; }, null, { timeout: 4000, polling: 'raf' });
  // a ball at the height of his waist, going along with him (15 px ahead and as fast as he runs: nearer than 9 px and low he would just take it down)
  await page.evaluate(() => { const m = window.__futbol.match, p = m.players.find((q) => q.humanSlot === 0); p.noControlT = 0; Object.assign(m.ball, { x: p.x + 15, y: p.y, z: 13, vx: p.vx, vy: 0, vz: 110, state: 'free', owner: null }); m.ball.lastTouch = { team: 0, player: m.players.find((q) => q.team === 0 && q.role === 'gk').id, t: m.t };   // (a ball of his own team: a rival's would knock him down)
    // Tiro goes down in this same moment (from the page: a key of the test would get there some frames later, with the ball somewhere else)
    const r = window.__futbol.router; r.setButton(0, 'test', 'shoot', true); setTimeout(() => r.setButton(0, 'test', 'shoot', false), 80); });
  await page.waitForFunction(() => !!window.__futbol.match.flight, null, { timeout: 2000 }).catch(() => {});
  await page.waitForTimeout(90); await page.screenshot({ path: 'docs/qa/shots/nk3_palomita.png' });
  await page.keyboard.up('KeyD'); await page.keyboard.up('KeyL');
  const r = await page.evaluate(() => { const m = window.__futbol.match, p = m.players.find((q) => q.humanSlot === 0); return { flight: !!m.flight, anim: p.supAnim, state: p.state }; });
  ok('palomita: corriendo hacia un balón a media altura, Tiro es el cabezazo en plancha de poder', r.flight && r.anim === 'dive', JSON.stringify(r));
  ok('palomita sin errores', errors.length === 0, errors.join('|'));
  await ctx.close();
}

// 4. the VS screen: the trip of the plane, then the crests meet; the pictures load
for (const [w, h] of [[844, 390], [1280, 720]]) {
  const { page, errors, ctx } = await openGame(b, srv.url, '', { viewport: { width: w, height: h } });
  await page.waitForSelector('#s-title'); await page.evaluate(() => { window.__futbol.store.data.stats.guideSeen = true; });
  await page.click('#s-title'); await page.waitForSelector('#s-main'); await page.click('#s-main [data-act=quick]'); await page.waitForSelector('#s-quick');
  await page.click('#s-quick .go'); await page.waitForSelector('#vs');
  await page.waitForTimeout(650);
  // during the trip the middle of the picture has the white of the plane and the squads are not shown yet
  const trip = await page.evaluate(() => { const c = document.querySelector('#vs canvas'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let white = 0; for (let y = 70; y < 120; y++) for (let x = 90; x < 230; x++) { const i = (y * c.width + x) * 4; if (d[i] > 240 && d[i + 1] > 240 && d[i + 2] > 240) white++; } return { white, met: document.getElementById('vs').classList.contains('met'), teams: getComputedStyle(document.querySelector('#vs .vteams')).visibility }; });
  ok(`${w}x${h}: VS, primero viaja el avión`, trip.white > 300 && !trip.met && trip.teams === 'hidden', JSON.stringify(trip));
  await page.screenshot({ path: `docs/qa/shots/nk3_vs_viaje_${w}.png` });
  await page.waitForFunction(() => document.getElementById('vs')?.classList.contains('met'), null, { timeout: 4000 });
  await page.waitForTimeout(500);
  const vs = await page.evaluate(() => { const c = document.querySelector('#vs canvas'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; const at = (x, y) => [d[(y * c.width + x) * 4], d[(y * c.width + x) * 4 + 1], d[(y * c.width + x) * 4 + 2]]; let gold = 0; for (let y = 30; y < 150; y++) for (let x = 0; x < c.width; x++) { const [r, g, b] = at(x, y); if (r > 230 && g > 180 && g < 215 && b < 70) gold++; } const r = c.getBoundingClientRect(); return { gold, left: at(10, 100), right: at(310, 100), teams: getComputedStyle(document.querySelector('#vs .vteams')).visibility, fits: r.x >= 0 && r.right <= innerWidth && r.bottom <= innerHeight }; });
  ok(`${w}x${h}: VS, los dos escudos dorados sobre los rayos de cada equipo`, vs.gold > 1500 && vs.left[2] > vs.left[0] && vs.right[0] > vs.right[2], JSON.stringify(vs));
  ok(`${w}x${h}: VS, los equipos aparecen al chocar los escudos y todo cabe`, vs.teams === 'visible' && vs.fits, JSON.stringify(vs));
  await page.screenshot({ path: `docs/qa/shots/nk3_vs_${w}.png` });
  ok(`${w}x${h}: VS sin errores (escudos y avión cargados)`, errors.length === 0, errors.join('|'));
  await ctx.close();
}

// 5. the captain is chosen in the quick match and remembered
{
  const { page, errors, ctx } = await openGame(b, srv.url, 'menu=main', PHONE);
  await page.waitForSelector('#s-main'); await page.click('#s-main [data-act=quick]'); await page.waitForSelector('#s-quick');
  ok('menú: por defecto manejas al del balón', await page.evaluate(() => document.querySelector('#cap .sel').textContent.trim() === 'Al del balón' && !document.getElementById('capwho')));
  await page.click('#cap .chip-o[data-i="1"]'); await page.waitForSelector('#capwho');
  await page.click('#capwho .chip-o[data-i="0"]'); await page.waitForTimeout(150);
  const s = await page.evaluate(() => ({ cap: JSON.parse(localStorage.getItem('futbol-familia/save')).settings.captain, who: document.querySelector('#capwho .sel').textContent.trim() }));
  ok('menú: Capitán se guarda y se elige quién es', s.cap === true && s.who.length > 2, JSON.stringify(s));
  await page.screenshot({ path: 'docs/qa/shots/nk3_menu_capitan.png' });
  await page.click('#cap .chip-o[data-i="0"]'); await page.waitForTimeout(150);
  ok('menú: se puede volver al del balón', await page.evaluate(() => JSON.parse(localStorage.getItem('futbol-familia/save')).settings.captain === false));
  ok('menú sin errores', errors.length === 0, errors.join('|'));
  await ctx.close();
}
await b.close(); srv.stop();
console.log(bad ? `${bad} FAIL` : 'nekketsu3: all passed');
process.exit(bad ? 1 : 0);
