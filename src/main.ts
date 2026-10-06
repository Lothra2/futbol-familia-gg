import Phaser from 'phaser';
import { computeLayout } from './core/layout';
import { BootScene } from './view/scenes/Boot';
import { MatchScene } from './view/scenes/MatchScene';
import { MenuScene } from './view/scenes/MenuScene';
import { App } from './app/app';
import { InputRouter } from './input/router';
import { KeyboardInput } from './input/keyboard';
import { TouchUI } from './input/touch';
import { GamepadInput } from './input/gamepad';
import { services } from './app/services';
import { Shell } from './app/shell';
import { SaveStore } from './save/save';
import { AudioEngine } from './audio/engine';
import { showSoundBoard } from './audio/board';
import { blockZoomGestures, watchFullscreen } from './app/fullscreen';

declare global {
  interface Window { __futbol?: Record<string, any>; __mockPads?: any }
}

const params = new URLSearchParams(location.search);
const layout = computeLayout(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: layout.w,
  height: layout.h,
  pixelArt: true,
  roundPixels: true,
  antialias: false,
  backgroundColor: '#2A1B3D',
  scale: { mode: Phaser.Scale.NONE },
  input: { keyboard: false, mouse: false, touch: false, gamepad: false },
  audio: { noAudio: true },
  scene: [BootScene, MenuScene, MatchScene],
});

function applyLayout() {
  const l = computeLayout(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
  game.scale.resize(l.w, l.h);
  const c = game.canvas;
  if (c) { c.style.width = `${l.cssW}px`; c.style.height = `${l.cssH}px`; }
}
window.addEventListener('resize', applyLayout);
window.addEventListener('orientationchange', applyLayout);
applyLayout();
game.canvas?.addEventListener('webglcontextlost', (e) => { e.preventDefault(); location.reload(); });

watchFullscreen(); blockZoomGestures();
const router = new InputRouter();
services.router = router;
const audio = new AudioEngine();
services.audio = audio;
// browsers only allow sound after a user gesture: the first tap, click or key unlocks it
for (const ev of ['pointerdown', 'keydown', 'touchend'] as const) window.addEventListener(ev, () => audio.unlock(), { capture: true });
const kb = new KeyboardInput(router);
const touch = new TouchUI(router);
const store = new SaveStore();
store.load();
const pad = new GamepadInput(router, () => shell?.pauseNow());
let shell: Shell;

game.events.once('assets-ready', () => {
  document.getElementById('loading')?.remove();
  kb.active = true;
  touch.setMode(store.data.settings.touchControls);
  const app = new App(game, router, touch, kb, pad, store);
  shell = new Shell(game, router, touch, kb);
  app.setShell(shell);
  shell.setEnabled(false);
  window.__futbol = {
    ready: true, game, services, store, router, touch, pad, audio, shell, app,
    get match() { return (game.scene.getScene('Match') as MatchScene | null)?.ctl?.m ?? null; },
    get scene() { return game.scene.getScene('Match') as MatchScene | null; },
  };
  app.boot(params);
  if (params.has('sounds')) showSoundBoard(audio);
});
