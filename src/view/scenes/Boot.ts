import Phaser from 'phaser';
import { makeTextures } from '../textures';
import { asset } from '../../asset';
import { PFX } from '../PixelFx';

/** Portraits of the rivals for the penalty shoot-out (tools/build_cine.py). */
export const CINE = ['riv_dragon_a', 'riv_dragon_b', 'riv_tiburon_a', 'riv_tiburon_b', 'riv_buho_a', 'riv_buho_b', 'riv_mapache_a', 'riv_mapache_b'];
/** Expressive faces of the family and Thor (tools/build_caras.py): 4 frames of 80 x 80, 0 determined, 1 fierce, 2 surprised, 3 laughing. */
export const FACES = ['sophie', 'alana', 'papa', 'mama', 'juandi', 'thor'];
export const OUTFIT_CHARS = ['sophie', 'alana', 'papa', 'mama', 'juandi', 'thor'];
export const STADIUMS = ['volcan', 'arrecife', 'nubes', 'bosque'];
/** Every atlas of the Nekketsu look (made by PixelForja, tools/nes): the family, Thor and the keeper and five kids of each kingdom. */
export const NES = ['sophie', 'alana', 'papa', 'mama', 'juandi', 'thor', ...['dragon', 'tiburon', 'buho', 'mapache'].flatMap((k) => [`riv_${k}_gk`, ...[1, 2, 3, 4, 5].map((i) => `riv_${k}_${i}`)])];
export const SHEETS = ['sophie', 'alana', 'papa', 'mama', 'juandi', 'thor', 'riv_dragon', 'riv_dragon_gk', 'riv_tiburon', 'riv_tiburon_gk', 'riv_buho', 'riv_buho_gk', 'riv_mapache', 'riv_mapache_gk'];

/** Loads the sprite sheets (48 x 48 cells) and their animation tables, bakes the small textures and tells the app it can show the menu. */
export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }
  preload(): void {
    const bar = document.getElementById('loadbar');
    this.load.on('progress', (v: number) => { if (bar) bar.style.width = `${Math.round(v * 100)}%`; });
    this.load.json('cine_meta', asset('assets/cine/meta.json'));
    for (const id of STADIUMS) {
      this.load.image(`bg_${id}`, asset(`assets/stadium/bg_${id}.png`));
      this.load.image(`bg2_${id}`, asset(`assets/stadium/bg2_${id}.png`));
      this.load.spritesheet(`props_${id}`, asset(`assets/stadium/props_${id}.png`), { frameWidth: 48, frameHeight: 48 });
    }
    for (const k of CINE) this.load.image(`cine_${k}`, asset(`assets/cine/${k}.png`));
    for (const c of FACES) this.load.spritesheet(`caras_${c}`, asset(`assets/cine/caras_${c}.png`), { frameWidth: 80, frameHeight: 80 });
    for (const c of OUTFIT_CHARS) for (const o of ['arcoiris', 'estrellas']) this.load.spritesheet(`${c}_${o}`, asset(`assets/sprites/${c}_${o}.png`), { frameWidth: 48, frameHeight: 48 });
    // the footballers in the Nekketsu style of PixelForja (tools/nes): 32 x 32 cells, five directions drawn and three by mirror
    // the size of the cell is in each JSON (32 for the sheets drawn in code, 56 for the ones made from Higgsfield pixel art): the
    // picture is queued once its JSON is in
    for (const k of NES) {
      this.load.once(`filecomplete-json-nes_${k}_meta`, (_key: string, _type: string, meta: { cell: [number, number] }) => {
        this.load.spritesheet(`nes_${k}`, asset(`assets/nes/${k}.png`), { frameWidth: meta.cell[0], frameHeight: meta.cell[1] });
      });
      this.load.json(`nes_${k}_meta`, asset(`assets/nes/${k}.json`));
    }
    // the big effects of the powers (tools/build_pixelfx.py): the size of each cell is in fx.json
    this.load.once('filecomplete-json-pfx_meta', (_key: string, _type: string, meta: Record<string, { w: number; h: number }>) => {
      for (const k of PFX) if (meta[k]) this.load.spritesheet(`pfx_${k}`, asset(`assets/fx/${k}.png`), { frameWidth: meta[k].w, frameHeight: meta[k].h });
    });
    this.load.json('pfx_meta', asset('assets/fx/fx.json'));
    // the plants, flowers and rocks at the edge of each pitch (tools/build_deco.py, from LPC Revised)
    this.load.image('deco', asset('assets/deco/deco.png')); this.load.json('deco_meta', asset('assets/deco/deco.json'));
    for (const k of SHEETS) {
      this.load.spritesheet(k, asset(`assets/sprites/${k}.png`), { frameWidth: 48, frameHeight: 48 });
      this.load.json(`${k}_meta`, asset(`assets/sprites/${k}.json`));
    }
  }
  create(): void {
    makeTextures(this);
    this.game.events.emit('assets-ready');
  }
}
