import Phaser from 'phaser';
import { makeTextures } from '../textures';

/** Cinematic illustrations (tools/build_cine.py). The kingdoms add theirs as they are made. */
export const CINE = ['sophie', 'alana', 'papa', 'mama', 'juandi', 'thor_a', 'thor_b', 'riv_dragon_a', 'riv_dragon_b', 'riv_tiburon_a', 'riv_tiburon_b', 'riv_buho_a', 'riv_buho_b', 'riv_mapache_a', 'riv_mapache_b'];
/** Expressive faces of the family and Thor (tools/build_caras.py): 4 frames of 80 x 80, 0 determined, 1 fierce, 2 surprised, 3 laughing. */
export const FACES = ['sophie', 'alana', 'papa', 'mama', 'juandi', 'thor'];
/** Painted backdrops of the flight of the ball, one per power (tools/build_fx.py). */
export const FX = ['arcoiris', 'burbuja', 'canonazo', 'estrellas', 'carrera', 'relampago', 'llamarada', 'ola', 'picada', 'hojas'];
export const OUTFIT_CHARS = ['sophie', 'alana', 'papa', 'mama', 'juandi', 'thor'];
export const STADIUMS = ['volcan', 'arrecife', 'nubes', 'bosque'];
export const SHEETS = ['sophie', 'alana', 'papa', 'mama', 'juandi', 'thor', 'riv_dragon', 'riv_dragon_gk', 'riv_tiburon', 'riv_tiburon_gk', 'riv_buho', 'riv_buho_gk', 'riv_mapache', 'riv_mapache_gk'];

/** Loads the sprite sheets (48 x 48 cells) and their animation tables, bakes the small textures and tells the app it can show the menu. */
export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }
  preload(): void {
    const bar = document.getElementById('loadbar');
    this.load.on('progress', (v: number) => { if (bar) bar.style.width = `${Math.round(v * 100)}%`; });
    this.load.json('cine_meta', 'assets/cine/meta.json');
    for (const id of STADIUMS) {
      this.load.image(`bg_${id}`, `assets/stadium/bg_${id}.png`);
      this.load.image(`bg2_${id}`, `assets/stadium/bg2_${id}.png`);
      this.load.spritesheet(`props_${id}`, `assets/stadium/props_${id}.png`, { frameWidth: 48, frameHeight: 48 });
    }
    for (const k of CINE) this.load.image(`cine_${k}`, `assets/cine/${k}.png`);
    for (const c of FACES) this.load.spritesheet(`caras_${c}`, `assets/cine/caras_${c}.png`, { frameWidth: 80, frameHeight: 80 });
    for (const k of FX) this.load.image(`cine_fx_${k}`, `assets/cine/fx_${k}.png`);
    for (const c of OUTFIT_CHARS) for (const o of ['arcoiris', 'estrellas']) this.load.spritesheet(`${c}_${o}`, `assets/sprites/${c}_${o}.png`, { frameWidth: 48, frameHeight: 48 });
    for (const k of SHEETS) {
      this.load.spritesheet(k, `assets/sprites/${k}.png`, { frameWidth: 48, frameHeight: 48 });
      this.load.json(`${k}_meta`, `assets/sprites/${k}.json`);
    }
  }
  create(): void {
    makeTextures(this);
    this.game.events.emit('assets-ready');
  }
}
