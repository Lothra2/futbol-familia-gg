// The voice of the match: lines in Spanish for the start, goals and the end; silent when the setting is off.
import { startPreview, launch, openGame } from './lib.mjs';
const srv = await startPreview();
const b = await launch();
let bad = 0;
const ok = (name, cond, extra = '') => { console.log(cond ? 'PASS' : 'FAIL', name, extra); if (!cond) bad++; };
const stub = () => {
  window.__said = []; window.SpeechSynthesisUtterance = function (t) { this.text = t; };
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { speaking: false, pending: false, getVoices: () => [{ lang: 'es-MX', name: 'Voz de prueba' }], cancel() {}, speak(u) { window.__said.push({ text: u.text, lang: u.lang, volume: u.volume }); } } });
};
for (const narr of [true, false]) {
  const { page, errors, ctx } = await openGame(b, srv.url, 'mode=quick&half=30&seed=9&autoplay=nina5&ff=8&controls=easy', { viewport: { width: 1280, height: 720 } }, stub);
  if (!narr) { await page.waitForFunction(() => window.__futbol?.match?.phase, null, { timeout: 20000 }); await page.evaluate(() => { const a = window.__futbol.app; window.__said = []; window.__futbol.store.data.settings.narrator = false; a.startMatch({ ...a.cfg }); }); }
  await page.waitForSelector('#result', { timeout: 120000 });
  const said = await page.evaluate(() => window.__said);
  if (narr) {
    ok('el narrador dice "Comienza el partido"', said.some((s) => /Comienza el partido/.test(s.text)), JSON.stringify(said.slice(0, 2)));
    ok('dice algo del final', said.some((s) => /Final del partido/.test(s.text)), JSON.stringify(said.slice(-2)));
    ok('habla en espanol con volumen', said.every((s) => /^es/.test(s.lang) && s.volume > 0 && s.volume <= 1));
    const goals = await page.evaluate(() => window.__futbol.match.stats.goals[0] + window.__futbol.match.stats.goals[1]);
    ok('narra los goles que hubo', goals === 0 || said.some((s) => /gol|Gol/.test(s.text)), `goles ${goals} frases ${said.length}`);
  } else ok('con el ajuste apagado no dice nada', said.length === 0, JSON.stringify(said));
  ok('sin errores', errors.length === 0, errors.join('|'));
  await ctx.close();
}
await b.close(); srv.stop();
console.log(bad ? `${bad} FAIL` : 'narrator: all passed');
process.exit(bad ? 1 : 0);
