import type { InputRouter } from '../input/router';
import type { MatchEvent } from '../core/types';

/** Everything the game asks of the sound system. Implemented in src/audio, replaced by a silent stub when audio is unavailable. */
export interface AudioApi {
  onFx(e: MatchEvent): void;
  unlock(): void;
  setVolumes(music: number, sfx: number, muted: boolean, crowd?: number): void;
  /** The stands: a murmur while a match is on (`crowd(true)`), swelling with the action. */
  crowd(on: boolean): void;
  swell(level: number, secs: number): void;
  /** Plays one effect or jingle by name. */
  play(name: string, rate?: number): void;
  music(name: string | null): void;
  ui(name: string): void;
  pause(on: boolean): void;
}
export interface AppApi { again(): void; menu(): void; finish(m: import('../core/state').Match): void; trainingDone(): void; coach(sc: import('../view/scenes/MatchScene').MatchScene): void }
export interface Services { router: InputRouter | null; audio: AudioApi | null; app: AppApi | null }
/** Shared singletons wired in main.ts. Scenes read them, nothing here talks to the network. */
export const services: Services = { router: null, audio: null, app: null };
