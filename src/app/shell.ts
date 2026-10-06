import type Phaser from 'phaser';
import type { InputRouter } from '../input/router';
import type { TouchUI } from '../input/touch';
import type { KeyboardInput } from '../input/keyboard';
import type { MatchScene } from '../view/scenes/MatchScene';
import { onFullscreenButton } from './fullscreen';
import { services } from './services';
import { T_ES } from '../data/text.es';
import { showGuideWindow } from '../ui/guide';

/** Pause, rotate-to-landscape card and focus handling shared by every screen. Menus come in M7. */
export class Shell {
  private ui = document.getElementById('ui')!;
  private pauseBtn: HTMLButtonElement;
  private menu: HTMLElement | null = null;
  private rotate = document.getElementById('rotate')!;
  private enabled = false;

  constructor(private game: Phaser.Game, private router: InputRouter, private touch: TouchUI, private kb: KeyboardInput) {
    this.pauseBtn = document.createElement('button');
    this.pauseBtn.className = 'hud-pause'; this.pauseBtn.id = 'pause'; this.pauseBtn.textContent = 'II'; this.pauseBtn.setAttribute('aria-label', 'Pausa');
    this.pauseBtn.addEventListener('click', () => this.togglePause());
    this.ui.appendChild(this.pauseBtn);
    router.onPause(() => this.togglePause());
    // losing focus, switching tabs or turning the device upright always pauses and lets go of every key and finger
    window.addEventListener('blur', () => this.pauseNow());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.pauseNow(); });
    window.addEventListener('pagehide', () => this.pauseNow());
    const orient = () => { const portrait = window.innerHeight > window.innerWidth; this.rotate.classList.toggle('on', portrait); if (portrait) this.pauseNow(); };
    window.addEventListener('resize', orient); window.addEventListener('orientationchange', orient); orient();
  }

  private scene(): MatchScene | null { return this.game.scene.getScene('Match') as MatchScene | null; }
  get paused(): boolean { return !!this.menu; }
  /** The pause button and the pause menu only exist while a match is on. */
  setEnabled(on: boolean): void {
    this.enabled = on; this.pauseBtn.classList.toggle('hidden', !on);
    if (!on) { this.menu?.remove(); this.menu = null; }
  }

  togglePause(): void { if (this.menu) this.resume(); else this.pauseNow(); }

  pauseNow(): void {
    if (this.menu || !this.enabled || document.getElementById('coach')) return;
    this.router.releaseAll(); this.touch.releaseAll(); this.kb.clear();
    this.scene()?.setPaused(true); services.audio?.pause(true);
    const m = document.createElement('div');
    m.className = 'screen dim'; m.id = 'pause-menu';
    m.innerHTML = `<div class="panel"><h2>${T_ES.pause.title}</h2><div class="col"><button class="btn big primary" id="resume">${T_ES.pause.resume}</button><button class="btn big" id="guide">Cómo se juega</button><button class="btn big fs-btn" id="fs">${T_ES.pause.fullscreen}</button><button class="btn big" id="quit">${T_ES.pause.quit}</button></div></div>`;
    m.querySelector('#resume')!.addEventListener('click', () => this.resume());
    m.querySelector('#quit')!.addEventListener('click', () => { this.menu?.remove(); this.menu = null; services.audio?.pause(false); services.app?.menu(); });
    m.querySelector('#guide')!.addEventListener('click', () => { showGuideWindow(); });
    m.querySelector('#fs')!.addEventListener('click', () => { void onFullscreenButton(); });
    this.ui.appendChild(m);
    this.menu = m;
  }

  resume(): void {
    this.menu?.remove(); this.menu = null;
    this.router.releaseAll();
    this.scene()?.setPaused(false); services.audio?.pause(false);
  }
}
