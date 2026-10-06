// M3: a whole match plays to the result screen in Chromium with no console errors (1P with the nina5 bot, 2P with two bots, 1P easy controls).
import { startPreview, launch, openGame } from './lib.mjs';
const srv = await startPreview();
const b = await launch();
let bad = 0;
const ok = (name, cond, extra = '') => { console.log(cond ? 'PASS' : 'FAIL', name, extra); if (!cond) bad++; };

async function whole(label, query, viewport) {
  const { page, errors, ctx } = await openGame(b, srv.url, query, viewport ? { viewport } : {});
  await page.waitForFunction(() => window.__futbol?.match, null, { timeout: 15000 });
  await page.waitForFunction(() => window.__futbol.match.phase === 'over', null, { timeout: 150000, polling: 500 });
  await page.waitForSelector('#result', { timeout: 10000 });
  const r = await page.evaluate(() => { const m = window.__futbol.match; return { score: m.score, t: Math.round(m.t), half: m.half, humans: m.humans.length, nan: m.players.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y)), text: document.getElementById('result').innerText.replace(/\n/g, ' | ') }; });
  ok(`${label}: termina en la pantalla de resultado`, r.half === 2 && r.t >= 30, JSON.stringify({ score: r.score, t: r.t }));
  ok(`${label}: sin NaN en jugadores`, !r.nan);
  ok(`${label}: el resultado muestra el marcador`, r.text.includes(`${r.score[0]} : ${r.score[1]}`), r.text);
  await page.click('#again'); await page.waitForTimeout(600);
  const again = await page.evaluate(() => ({ phase: window.__futbol.match.phase, t: window.__futbol.match.t, result: !!document.getElementById('result') }));
  ok(`${label}: Otra vez empieza un partido nuevo`, again.t < 20 && !again.result, JSON.stringify(again));
  ok(`${label}: sin errores de consola`, errors.length === 0, errors.join('|'));
  await ctx.close();
}

await whole('1P nina5 facil', 'mode=quick&autoplay&ff=8&half=30&controls=easy&seed=11');
await whole('2P dos bots', 'mode=quick&autoplay&players=2&ff=8&half=30&seed=12&chars=papa,alana');
await whole('1P sophie completos 667x375', 'mode=quick&autoplay=sophie&ff=8&half=30&seed=13&difficulty=campeones', { width: 667, height: 375 });
await whole('1P con Juandi en cancha (descansa Papa)', 'mode=quick&autoplay&ff=8&half=30&seed=14&squad=mama,sophie,alana,juandi');
await b.close(); srv.stop();
console.log(bad ? `${bad} FAIL` : 'match: all passed');
process.exit(bad ? 1 : 0);
