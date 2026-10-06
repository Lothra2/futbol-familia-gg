/** Tunes of the game (M0 keeps only the menu tune as a placeholder, M8 writes the real ones). Original compositions written as data: sixteen steps per bar, scale degrees for the melody.
 *  `songBar` turns one bar into note events, so the live player and the tests share exactly the same music. */

export type Voice = 'lead' | 'harm' | 'arp' | 'bass' | 'kick' | 'snare' | 'hat';
export interface NoteEv { t: number; dur: number; voice: Voice; midi: number; vol: number }
type Chord = [root: number, quality: 'M' | 'm'];
interface Section { chords: Chord[]; lead: string[] }
export interface Song {
  name: string; bpm: number; tonic: number; minor?: boolean; order: number[]; sections: Section[];
  bass: 'root4' | 'eighth' | 'walk' | 'octave'; drums: { kick: string; snare: string; hat: string }; arp: boolean; swing?: number;
}

const MAJOR = [0, 2, 4, 5, 7, 9, 11], MINOR = [0, 2, 3, 5, 7, 8, 10];

const degree = (tok: string, tonic: number, minor: boolean): number => {
  const m = /^(\d)([+-]*)$/.exec(tok)!;
  const sc = minor ? MINOR : MAJOR, d = Number(m[1]) - 1;
  const oct = (m[2].match(/\+/g)?.length ?? 0) - (m[2].match(/-/g)?.length ?? 0);
  return tonic + sc[d] + 12 * oct;
};

export const SONGS: Record<string, Song> = {
  menu: {
    name: 'Mañana en el bosque', bpm: 104, tonic: 60, order: [0, 0, 1, 0], bass: 'root4', arp: true,
    drums: { kick: 'x.......x.......', snare: '....x.......x...', hat: '..x...x...x...x.' },
    sections: [
      { chords: [[0, 'M'], [9, 'm'], [5, 'M'], [7, 'M']], lead: ['5 . 3 . 5 . 6 . 5 . . . 3 . . .', '6 . 1+ . 6 . 5 . 3 . . . . . . .', '4 . 6 . 1+ . 6 . 4 . 6 . 5 . . .', '5 . 4 . 2 . 4 . 5 - - - - . . .'] },
      { chords: [[5, 'M'], [7, 'M'], [4, 'm'], [9, 'm']], lead: ['6 . 6 . 1+ . 6 . 4 . . . 6 . . .', '7 . 7 . 2+ . 7 . 5 . . . 7 . . .', '3+ . 3+ . 2+ . 1+ . 7 . . . 5 . . .', '6 - - - 1+ - - - 3+ - - - . . . .'] },
    ],
  },
  bosque: {
    name: 'Mapachitos en el claro', bpm: 116, tonic: 62, order: [0, 0, 1, 0], bass: 'walk', arp: false,
    drums: { kick: 'x.....x.x.......', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' },
    sections: [
      { chords: [[0, 'M'], [7, 'M'], [9, 'm'], [5, 'M']], lead: ['3 . 5 . 6 . 5 . 3 . 1 . 2 . 3 .', '2 . 4 . 5 . 4 . 2 . 7- . 1 . 2 .', '1 . 3 . 5 . 3 . 6 . 5 . 3 . 1 .', '4 . 6 . 1+ . 6 . 5 - - - . . . .'] },
      { chords: [[5, 'M'], [0, 'M'], [7, 'M'], [0, 'M']], lead: ['6 . 1+ . 6 . 4 . 6 . 1+ . 3+ . . .', '5 . 3 . 5 . 1+ . 5 . 3 . 1 . . .', '7- . 2 . 4 . 5 . 4 . 2 . 7- . . .', '1 - - - 3 - - - 5 - - - 1+ - - -'] },
    ],
  },
  arrecife: {
    name: 'Olas en el arrecife', bpm: 128, tonic: 67, order: [0, 0, 1, 0], bass: 'eighth', arp: false,
    drums: { kick: 'x.......x.......', snare: '....x.......x...', hat: '.x.x.x.x.x.x.x.x' },
    sections: [
      { chords: [[0, 'M'], [0, 'M'], [5, 'M'], [7, 'M']], lead: ['5 . . 5 . 6 5 . 3 . . . 5 . . .', '5 . . 5 . 6 5 . 2 . . . 3 . . .', '4 . . 4 . 5 4 . 6 . . . 1+ . . .', '7 . . 7 . 2+ 7 . 5 . . . . . . .'] },
      { chords: [[9, 'm'], [5, 'M'], [0, 'M'], [7, 'M']], lead: ['6 . 1+ . 3+ . 1+ . 6 . 1+ . 6 . . .', '4 . 6 . 1+ . 6 . 4 . 6 . 4 . . .', '3 . 5 . 1+ . 5 . 3 . 5 . 1+ . . .', '2 . 4 . 7 . 4 . 5 - - - . . . .'] },
    ],
  },
  nubes: {
    name: 'Sobre las nubes', bpm: 88, tonic: 64, order: [0, 1, 0, 1], bass: 'root4', arp: true,
    drums: { kick: 'x...............', snare: '........x.......', hat: '....x.......x...' },
    sections: [
      { chords: [[0, 'M'], [9, 'm'], [5, 'M'], [7, 'M']], lead: ['5 - - - 3 - - - 1 - - - 3 - - -', '6 - - - 5 - - - 3 - - - 1 - - -', '4 - - - 6 - - - 1+ - - - 6 - - -', '7 - - - 5 - - - 2 - - - 5 - - -'] },
      { chords: [[5, 'M'], [7, 'M'], [9, 'm'], [0, 'M']], lead: ['1+ . 6 . 4 . 6 . 1+ . 6 . 4 . . .', '2+ . 7 . 5 . 7 . 2+ . 7 . 5 . . .', '3+ . 1+ . 6 . 1+ . 3+ . 1+ . 6 . . .', '5 - - - 3 - - - 1 - - - . . . .'] },
    ],
  },
  volcan: {
    name: 'Fuego en el volcán', bpm: 140, tonic: 57, minor: true, order: [0, 0, 1, 0], bass: 'octave', arp: true,
    drums: { kick: 'x...x...x...x.x.', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' },
    sections: [
      { chords: [[0, 'm'], [8, 'M'], [3, 'M'], [10, 'M']], lead: ['5 . 5 . 1+ . 7 . 5 . . . 3 . . .', '6 . 6 . 1+ . 6 . 4 . . . 6 . . .', '3 . 5 . 7 . 5 . 3 . . . 5 . . .', '7 . 7 . 2+ . 7 . 5 - - - . . . .'] },
      { chords: [[0, 'm'], [5, 'm'], [8, 'M'], [7, 'M']], lead: ['1+ . 1+ . 3+ . 2+ . 1+ . 7 . 5 . . .', '1+ . 1+ . 4+ . 3+ . 1+ . 6 . 4 . . .', '6 . 1+ . 3+ . 1+ . 6 . 1+ . 3+ . . .', '2+ - - - 7 - - - 5 - - - . . . .'] },
    ],
  },
};

export const SONG_NAMES = Object.keys(SONGS);
export const songBars = (s: Song): number => s.order.length * s.sections[0].lead.length;
export const stepSeconds = (s: Song): number => 60 / s.bpm / 4;

const drumHit = (pat: string, i: number): boolean => pat[i % 16] === 'x';

/** Note events of one bar (bar index counts from 0 and wraps around the loop). Times are seconds from the start of the bar. */
export function songBar(s: Song, bar: number): NoteEv[] {
  const total = songBars(s), b = ((bar % total) + total) % total;
  const per = s.sections[0].lead.length, secIdx = s.order[Math.floor(b / per)], inSec = b % per;
  const sec = s.sections[secIdx], second = s.order.slice(0, Math.floor(b / per)).filter((x) => x === secIdx).length > 0;
  const [root, q] = sec.chords[inSec], minor = !!s.minor;
  const st = stepSeconds(s);
  const out: NoteEv[] = [];
  // melody. A section heard a second time is doubled by a soft harmony a third below
  const toks = sec.lead[inSec].trim().split(/\s+/);
  let i = 0;
  while (i < 16) {
    const tok = toks[i];
    if (tok === '.' || tok === '-') { i++; continue; }
    let len = 1;
    while (i + len < 16 && toks[i + len] === '-') len++;
    const midi = degree(tok, s.tonic, minor);
    const dur = len * st;
    out.push({ t: i * st, dur: Math.max(st * 0.8, dur * 0.92), voice: 'lead', midi, vol: 0.2 });
    if (second) out.push({ t: i * st, dur: Math.max(st * 0.8, dur * 0.9), voice: 'harm', midi: midi - (minor ? 3 : 4), vol: 0.1 });
    i += len;
  }
  // chord tones
  const base = s.tonic - 12 + root;
  const third = q === 'M' ? 4 : 3;
  const tones = [base, base + third, base + 7, base + 12];
  if (s.arp) {
    for (let k = 0; k < 16; k++) out.push({ t: k * st, dur: st * 0.8, voice: 'arp', midi: tones[[0, 1, 2, 3, 2, 1, 2, 1][k % 8]] + 12, vol: 0.055 });
  }
  const bassRoot = s.tonic - 24 + root;
  switch (s.bass) {
    case 'root4': for (let k = 0; k < 4; k++) out.push({ t: k * 4 * st, dur: st * 3.4, voice: 'bass', midi: bassRoot, vol: 0.3 }); break;
    case 'eighth': for (let k = 0; k < 8; k++) out.push({ t: k * 2 * st, dur: st * 1.7, voice: 'bass', midi: bassRoot + (k % 2 ? 12 : 0), vol: 0.28 }); break;
    case 'walk': [0, 7, 12, 7].forEach((o, k) => out.push({ t: k * 4 * st, dur: st * 3.4, voice: 'bass', midi: bassRoot + o, vol: 0.3 })); break;
    case 'octave': for (let k = 0; k < 8; k++) out.push({ t: k * 2 * st, dur: st * 1.2, voice: 'bass', midi: bassRoot + (k % 4 === 3 ? 7 : k % 2 ? 12 : 0), vol: 0.28 }); break;
  }
  for (let k = 0; k < 16; k++) {
    if (drumHit(s.drums.kick, k)) out.push({ t: k * st, dur: 0.12, voice: 'kick', midi: 0, vol: 0.5 });
    if (drumHit(s.drums.snare, k)) out.push({ t: k * st, dur: 0.12, voice: 'snare', midi: 0, vol: 0.28 });
    if (drumHit(s.drums.hat, k)) out.push({ t: k * st, dur: 0.04, voice: 'hat', midi: 0, vol: 0.1 });
  }
  return out;
}
