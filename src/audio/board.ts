import type { AudioEngine } from './engine';
import { SFX } from './sfx';
import { SONGS } from './songs';

/** `?sounds` shows every effect and tune as a button, to listen to them one by one. */
export function showSoundBoard(engine: AudioEngine): void {
  const box = document.createElement('div');
  box.id = 'soundboard';
  box.style.cssText = 'position:fixed;inset:0;z-index:99;overflow:auto;background:#2A1B3D;color:#FFF7EC;font:14px "Pixelify Sans",sans-serif;padding:16px';
  const btn = (label: string, fn: () => void) => `<button data-k="${label}" style="margin:3px;padding:8px 10px;border-radius:8px;border:2px solid #FFE45C;background:#4B3768;color:#FFF7EC;font:inherit;cursor:pointer">${label}</button>`;
  box.innerHTML = `<h2>Prueba de sonidos</h2><p>Toca un botón. La primera vez activa el audio del navegador.</p>
    <h3>Música</h3><div id="sb-music">${Object.entries(SONGS).map(([k, s]) => btn(k, () => {}).replace(`>${k}<`, `>${k}: ${s.name}<`)).join('')}${btn('parar', () => {})}</div>
    <h3>Efectos</h3><div id="sb-sfx">${Object.keys(SFX).map((k) => btn(k, () => {})).join('')}</div>`;
  document.body.appendChild(box);
  box.querySelector('#sb-music')!.addEventListener('click', (e) => {
    const k = (e.target as HTMLElement).dataset.k; if (!k) return;
    engine.unlock(); engine.music(k === 'parar' ? null : k);
  });
  box.querySelector('#sb-sfx')!.addEventListener('click', (e) => {
    const k = (e.target as HTMLElement).dataset.k; if (!k) return;
    engine.unlock(); engine.play(k);
  });
}
