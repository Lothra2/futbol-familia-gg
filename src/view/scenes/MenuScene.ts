import Phaser from 'phaser';
import { services } from '../../app/services';

/**
 * What is under the menus: nothing. It used to play a match of the family against a kingdom by itself (the attract mode of the NES games), but
 * every menu covers the whole screen now, and that match showed for a moment when a screen went away (a match that was not the one the person
 * had chosen). The scene stays for the music of the menu and so the game has a place to be between matches.
 */
export class MenuScene extends Phaser.Scene {
  constructor() { super('Menu'); }
  create(): void {
    this.cameras.main.setBackgroundColor('#2c4a94');   // the navy of the menus and of the VS screen
    services.audio?.crowd(false); services.audio?.music('menu');
  }
}
