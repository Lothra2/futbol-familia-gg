/** The four kingdoms as Nintendo World Cup pitches: every one has its own ground, its own patches and little things on the grass,
 *  its stands and its boards. Pure data, so the menu, the pitch and the tests read the same thing. */
export type WorldId = 'volcan' | 'bosque' | 'arrecife' | 'nubes';

export interface World {
  name: string;
  /** The two stripes of the ground (horizontal bands, like the NES game) and the colour of the patches on top. */
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
  volcan: {
    name: 'Volcán Dragón', stripe: ['#4f8a3c', '#467d36'], patch: ['#7a6248', '#6a5440'], out: '#3c6a30', track: '#5a3e34', line: '#f4fff2',
    deco: { kind: 'piedras', colors: ['#2e2230', '#ff7a2e', '#4a3a3a'], density: 3 }, patchCover: 0.22, patchSize: 26,
    wall: '#3a2438', seats: ['#5a3a50', '#4a2e42'], fans: ['#ff8a2a', '#ffd447', '#ff5e3a', '#f4e3c4', '#5ddb43'],
    boards: ['#ff8a2a', '#2a1b3d', '#ffd447'], boardText: ['VOLCÁN', 'FAMILIA GG', '¡FUEGO!'], time: 'night',
  },
  bosque: {
    name: 'Bosque Arcoíris', stripe: ['#5cbd4c', '#52ad44'], patch: ['#7fd86a', '#74cc60'], out: '#4a9a3e', track: '#8a6a44', line: '#ffffff',
    deco: { kind: 'flores', colors: ['#ffffff', '#ffe45c', '#ff9ac8'], density: 6 }, patchCover: 0.32, patchSize: 30,
    wall: '#2f5a3a', seats: ['#4a7a50', '#3e6a44'], fans: ['#8aa0a8', '#c8d0d8', '#5ddb43', '#ffd447', '#f4e3c4'],
    boards: ['#5ddb43', '#2a1b3d', '#ffd447'], boardText: ['BOSQUE', 'FAMILIA GG', 'JUGO DE MANGO'], time: 'sunset',
  },
  arrecife: {
    name: 'Arrecife Coral', stripe: ['#e8cf8f', '#dcc282'], patch: ['#c9ac6c', '#bea061'], out: '#d4b878', track: '#4cc9e8', line: '#ffffff',
    deco: { kind: 'conchas', colors: ['#ff8aa8', '#ffffff', '#ffb27a'], density: 3 }, patchCover: 0.26, patchSize: 24,
    wall: '#2f6fa0', seats: ['#4c8fc0', '#3e7ab0'], fans: ['#5ea8ff', '#ffffff', '#ff6fb5', '#7be3ff', '#f4e3c4'],
    boards: ['#7be3ff', '#2a1b3d', '#ff6fb5'], boardText: ['ARRECIFE', 'FAMILIA GG', 'HELADOS OLA'], time: 'day',
  },
  nubes: {
    name: 'Nube Alta', stripe: ['#9fdcb0', '#93d0a4'], patch: ['#e4f6ff', '#d4eef8'], out: '#88c89a', track: '#c8b0e8', line: '#ffffff',
    deco: { kind: 'brillos', colors: ['#ffffff', '#fff3b0', '#bff3ff'], density: 4 }, patchCover: 0.24, patchSize: 34,
    wall: '#6a5a9a', seats: ['#8a7ab8', '#7a6aa8'], fans: ['#e0b060', '#ffffff', '#b98cff', '#ffd447', '#f4e3c4'],
    boards: ['#ffd447', '#2a1b3d', '#ffffff'], boardText: ['NUBE ALTA', 'FAMILIA GG', 'PANADERÍA LA NUBE'], time: 'sunset',
  },
};

/** A small deterministic noise for the patches: the same pitch every time for the same kingdom. */
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
