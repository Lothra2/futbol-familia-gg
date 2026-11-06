/** The four kingdoms as Nintendo World Cup pitches: every one has its own ground, its own patches and little things on the grass,
 *  its stands and its boards. Pure data, so the menu, the pitch and the tests read the same thing. */
export type WorldId = 'volcan' | 'bosque' | 'arrecife' | 'nubes';

export interface World {
  name: string;
  /** The ground (horizontal bands like the NES game): the base colour and the darker one it is dithered with on every other band;
   *  the patches on top: their colour and the one of the dither at their edge. */
  stripe: [string, string]; patch: [string, string];
  /** The ground outside the lines, the track behind the goals and the line colour. */
  out: string; track: string; line: string;
  /** Little things scattered on the ground: their colours and how many per 100 x 100 px. */
  deco: { kind: 'flores' | 'piedras' | 'conchas' | 'brillos' | 'hojas'; colors: string[]; density: number };
  /** How much of the ground the patches cover (0 to 1) and how big their blobs are (px). */
  patchCover: number; patchSize: number;
  /** The stands above the far touchline: wall, two seat tones and the colours of the fans. */
  wall: string; seats: [string, string]; fans: string[];
  boards: string[]; boardText: string[];
  /** The hour that suits the kingdom. */
  time: 'day' | 'sunset' | 'night';
}

export const WORLDS: Record<WorldId, World> = {
  // the dirt pitch of Nintendo World Cup (from the video): speckled orange ground, big olive patches of worn grass, cream lines
  volcan: {
    name: 'Volcán Dragón', stripe: ['#e8a050', '#d08838'], patch: ['#8c8a2c', '#a09434'], out: '#c88838', track: '#5a3e34', line: '#fff0c8',
    deco: { kind: 'piedras', colors: ['#9a5a22', '#fff0d0', '#b86a2a'], density: 3 }, patchCover: 0.36, patchSize: 36,
    wall: '#3a2438', seats: ['#5a3a50', '#4a2e42'], fans: ['#ff8a2a', '#ffd447', '#ff5e3a', '#f4e3c4', '#5ddb43'],
    boards: ['#ff8a2a', '#2a1b3d', '#ffd447'], boardText: ['VOLCÁN', 'FAMILIA GG', '¡FUEGO!'], time: 'day',
  },
  // the grass pitch of the NES game, the colours taken from the video: bright green, dithered bands, light green patches and white flower rings
  bosque: {
    name: 'Bosque Arcoíris', stripe: ['#64eb36', '#3cb032'], patch: ['#91eb90', '#7cd878'], out: '#4cc030', track: '#8a6a44', line: '#ffffff',
    deco: { kind: 'flores', colors: ['#e8ffe8', '#ffffff'], density: 5 }, patchCover: 0.36, patchSize: 36,
    wall: '#2f5a3a', seats: ['#4a7a50', '#3e6a44'], fans: ['#8aa0a8', '#c8d0d8', '#5ddb43', '#ffd447', '#f4e3c4'],
    boards: ['#5ddb43', '#2a1b3d', '#ffd447'], boardText: ['BOSQUE', 'FAMILIA GG', 'JUGO DE MANGO'], time: 'day',
  },
  arrecife: {
    name: 'Arrecife Coral', stripe: ['#f4d888', '#dcb864'], patch: ['#fff0c0', '#f4e0a8'], out: '#e0c070', track: '#4cc9e8', line: '#ffffff',
    deco: { kind: 'conchas', colors: ['#ff8aa8', '#ffffff', '#ffb27a'], density: 3 }, patchCover: 0.32, patchSize: 32,
    wall: '#2f6fa0', seats: ['#4c8fc0', '#3e7ab0'], fans: ['#5ea8ff', '#ffffff', '#ff6fb5', '#7be3ff', '#f4e3c4'],
    boards: ['#7be3ff', '#2a1b3d', '#ff6fb5'], boardText: ['ARRECIFE', 'FAMILIA GG', 'HELADOS OLA'], time: 'day',
  },
  nubes: {
    name: 'Nube Alta', stripe: ['#78e8b8', '#4cc890'], patch: ['#d0fff0', '#b8f4e0'], out: '#58d098', track: '#c8b0e8', line: '#ffffff',
    deco: { kind: 'brillos', colors: ['#ffffff', '#fff3b0', '#bff3ff'], density: 4 }, patchCover: 0.34, patchSize: 38,
    wall: '#6a5a9a', seats: ['#8a7ab8', '#7a6aa8'], fans: ['#e0b060', '#ffffff', '#b98cff', '#ffd447', '#f4e3c4'],
    boards: ['#ffd447', '#2a1b3d', '#ffffff'], boardText: ['NUBE ALTA', 'FAMILIA GG', 'PANADERÍA LA NUBE'], time: 'day',
  },
};

/** A small deterministic noise for the patches: the same pitch every time for the same kingdom. */
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
