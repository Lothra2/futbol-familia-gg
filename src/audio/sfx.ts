/** Sound effects synthesized from tiny recipes. No samples, no files: every sound is generated here, so there is nothing to license.
 *  `renderSfx` is pure (recipe in, samples out), so it runs the same in the browser and in unit tests. */

export type Wave = 'sq' | 'sin' | 'saw' | 'tri' | 'noise';
/** One layer of a sound. `f` slides exponentially from f[0] to f[1] Hz, `at` delays the layer, `lp` smooths noise (0..1, higher = darker). */
export interface Seg { w: Wave; f: [number, number]; d: number; v?: number; at?: number; duty?: number; vib?: [number, number]; lp?: number; atk?: number; curve?: number }
export interface SfxDef { segs: Seg[]; gap?: number }

const n = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);
const tone = (w: Wave, midi: number, at: number, d: number, v = 0.5, extra: Partial<Seg> = {}): Seg => ({ w, f: [n(midi), n(midi)], d, at, v, ...extra });
const arp = (w: Wave, midis: number[], step: number, d: number, v = 0.45): Seg[] => midis.map((m, i) => tone(w, m, i * step, d, v));

export const SFX: Record<string, SfxDef> = {
  click: { segs: [tone('sq', 84, 0, 0.05, 0.35, { duty: 0.25 })] },
  whistle: { segs: [{ w: 'sin', f: [2300, 2300], d: 0.5, v: 0.4, vib: [32, 0.05], atk: 0.02 }, { w: 'sin', f: [3100, 3100], d: 0.5, v: 0.12, vib: [32, 0.05], atk: 0.02 }] },
  count: { segs: [tone('sq', 69, 0, 0.18, 0.4, { duty: 0.5 })] },
  go: { segs: [tone('sq', 81, 0, 0.4, 0.4, { duty: 0.5 }), tone('sq', 88, 0, 0.4, 0.3, { duty: 0.5 })] },
  kick: { segs: [{ w: 'sin', f: [190, 70], d: 0.1, v: 0.65 }, { w: 'noise', f: [0, 0], d: 0.05, v: 0.35, lp: 0.5 }] },
  pass: { segs: [{ w: 'sin', f: [250, 110], d: 0.07, v: 0.45 }, { w: 'noise', f: [0, 0], d: 0.04, v: 0.2, lp: 0.6 }] },
  post: { segs: [tone('sq', 96, 0, 0.08, 0.35, { duty: 0.125 }), tone('sq', 103, 0.03, 0.14, 0.3, { duty: 0.125 }), { w: 'noise', f: [0, 0], d: 0.03, v: 0.25, lp: 0.2 }] },
  net: { segs: [{ w: 'noise', f: [0, 0], d: 0.28, v: 0.35, lp: 0.3, atk: 0.02 }] },
  whistle2: { segs: [{ w: 'sin', f: [2300, 2300], d: 0.35, v: 0.4, vib: [32, 0.05], atk: 0.02 }, { w: 'sin', f: [2300, 2300], d: 0.5, v: 0.4, vib: [32, 0.05], atk: 0.02, at: 0.45 }] },
  whistle3: { segs: [0, 0.4, 0.8].map((at) => ({ w: 'sin' as const, f: [2300, 2300] as [number, number], d: 0.3, v: 0.4, vib: [32, 0.05] as [number, number], atk: 0.02, at })) },
  goal: { segs: [...arp('sq', [72, 76, 79, 84, 88], 0.08, 0.16, 0.35), tone('sq', 91, 0.4, 0.5, 0.35), tone('tri', 60, 0.4, 0.6, 0.45)] },
  slide: { segs: [{ w: 'noise', f: [0, 0], d: 0.3, v: 0.4, lp: 0.3, atk: 0.05 }] },
  bump: { segs: [{ w: 'noise', f: [0, 0], d: 0.08, v: 0.45, lp: 0.5 }, { w: 'sin', f: [120, 60], d: 0.1, v: 0.5 }] },
  steal: { segs: [{ w: 'sq', f: [520, 860], d: 0.08, v: 0.35, duty: 0.5 }] },
  save: { segs: [{ w: 'noise', f: [0, 0], d: 0.06, v: 0.4, lp: 0.4 }, { w: 'sin', f: [220, 100], d: 0.12, v: 0.5 }] },
  catch: { segs: [{ w: 'sin', f: [330, 220], d: 0.07, v: 0.35 }] },
  bounce: { segs: [{ w: 'sin', f: [330, 200], d: 0.05, v: 0.25 }] },
  special: { segs: arp('sq', [72, 76, 79, 84, 88, 91], 0.05, 0.12, 0.35) },
  starfull: { segs: [...arp('tri', [96, 100, 103], 0.09, 0.18, 0.4), tone('sq', 108, 0.27, 0.3, 0.25)] },
  zas: { segs: [{ w: 'noise', f: [0, 0], d: 0.15, v: 0.25, lp: 0.2 }, { w: 'saw', f: [800, 200], d: 0.12, v: 0.2 }] },
  whiff: { segs: [{ w: 'noise', f: [0, 0], d: 0.09, v: 0.16, lp: 0.2, atk: 0.03 }] },
  star: { segs: [tone('sq', 88, 0, 0.07, 0.4, { duty: 0.25 }), tone('sq', 95, 0.07, 0.16, 0.4, { duty: 0.25 })] },
  tap: { segs: [tone('sq', 84, 0, 0.05, 0.3, { duty: 0.25 }), tone('sq', 91, 0.035, 0.05, 0.25, { duty: 0.25 })] },
  tick: { segs: [tone('sq', 96, 0, 0.03, 0.25, { duty: 0.125 })] },
  lob: { segs: [tone('tri', 91, 0, 0.07, 0.35), tone('tri', 98, 0.05, 0.1, 0.35)] },
  whoosh: { segs: [{ w: 'noise', f: [0, 0], d: 0.42, v: 0.4, lp: 0.55, atk: 0.22, curve: 0.9 }, { w: 'sin', f: [260, 1900], d: 0.4, v: 0.18, atk: 0.2, curve: 0.8 }] },
  impact: { segs: [{ w: 'sin', f: [150, 38], d: 0.4, v: 0.85 }, { w: 'noise', f: [0, 0], d: 0.22, v: 0.5, lp: 0.35 }, { w: 'saw', f: [220, 60], d: 0.25, v: 0.25 }] },
  slam: { segs: [{ w: 'sin', f: [120, 32], d: 0.55, v: 0.9 }, { w: 'noise', f: [0, 0], d: 0.4, v: 0.55, lp: 0.3 }, { w: 'saw', f: [180, 50], d: 0.4, v: 0.3 }, tone('sq', 79, 0.05, 0.3, 0.25, { duty: 0.25 })] },
  penstart: { segs: [0, 0.09, 0.18, 0.27, 0.36, 0.45, 0.54].map((at, i) => ({ w: 'noise' as const, f: [0, 0] as [number, number], d: 0.07, v: 0.2 + i * 0.05, lp: 0.45, at })).concat([{ w: 'noise' as const, f: [0, 0] as [number, number], d: 0.3, v: 0.5, lp: 0.3, at: 0.66 }]) },
  goldensting: { segs: [...arp('sq', [76, 83, 88, 95], 0.07, 0.12, 0.35), tone('tri', 64, 0, 0.6, 0.4), { w: 'noise', f: [0, 0], d: 0.5, v: 0.2, lp: 0.5, atk: 0.3, at: 0.1 }] },
  win: { segs: [...arp('sq', [67, 72, 76, 79, 84], 0.1, 0.12, 0.35), tone('sq', 88, 0.5, 0.7, 0.35), tone('sq', 84, 0.5, 0.7, 0.2), tone('tri', 60, 0, 1.2, 0.4), tone('tri', 67, 0.5, 0.9, 0.4)] },
  draw: { segs: [tone('sq', 72, 0, 0.18, 0.3), tone('sq', 72, 0.2, 0.18, 0.3), tone('sq', 67, 0.4, 0.5, 0.3), tone('tri', 55, 0.4, 0.6, 0.35)] },
  lose: { segs: [tone('tri', 67, 0, 0.25, 0.4), tone('tri', 64, 0.25, 0.25, 0.4), tone('tri', 60, 0.5, 0.25, 0.4), tone('tri', 55, 0.75, 0.7, 0.4), tone('sin', 43, 0.75, 0.8, 0.3)] },
  champion: { segs: [...arp('sq', [60, 64, 67, 72, 76, 79, 84], 0.09, 0.14, 0.35), tone('sq', 88, 0.65, 0.5, 0.35), tone('sq', 91, 1.15, 0.4, 0.35), tone('sq', 96, 1.55, 0.8, 0.35), tone('tri', 48, 0, 0.7, 0.45), tone('tri', 55, 0.65, 0.9, 0.45), tone('tri', 60, 1.55, 0.8, 0.45), tone('sq', 84, 1.55, 0.8, 0.2)] },
  roar: { segs: [{ w: 'noise', f: [0, 0], d: 1.2, v: 0.28, lp: 0.7, atk: 0.4, curve: 0.7 }] },
  fanfare: { segs: [...arp('sq', [67, 67, 67, 72], 0.14, 0.12, 0.35), tone('sq', 76, 0.56, 0.3, 0.35), tone('sq', 72, 0.9, 0.12, 0.35), tone('sq', 76, 1.02, 0.12, 0.35), tone('sq', 79, 1.14, 0.7, 0.35), tone('tri', 55, 0.56, 1.3, 0.45)] },
};

/** Which sound a match event asks for. M3 and M8 add the soccer effects. */
export const FX_TO_SFX: Record<string, string> = {
  whistle: 'whistle', go: 'go', kick: 'kick', pass: 'pass', wall: 'pass', post: 'post', bar: 'post', goal: 'goal', slide: 'slide', slideball: 'kick', slidehit: 'bump', bump: 'bump',
  steal: 'steal', penstart: 'penstart', golden: 'goldensting', save: 'save', catch: 'catch', bounce: 'bounce', deflect: 'bounce', special: 'special', starfull: 'starfull', zas: 'zas', whiff: 'whiff', dive: 'whiff',
};

const duration = (def: SfxDef): number => def.segs.reduce((m, s) => Math.max(m, (s.at ?? 0) + s.d), 0);

/** Mono samples in [-1, 1]. Deterministic (own LCG noise) so tests are stable. */
export function renderSfx(def: SfxDef, rate: number): Float32Array {
  const len = Math.ceil((duration(def) + 0.02) * rate);
  const out = new Float32Array(len);
  let seed = 12345;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 * 2 - 1; };
  for (const s of def.segs) {
    const i0 = Math.floor((s.at ?? 0) * rate), cnt = Math.floor(s.d * rate), v = s.v ?? 0.5, atk = Math.max(0.003, s.atk ?? 0.004);
    let ph = 0, lp = 0;
    for (let i = 0; i < cnt && i0 + i < len; i++) {
      const t = i / rate, u = i / cnt;
      let f = s.f[0] > 0 ? s.f[0] * Math.pow(s.f[1] / s.f[0], u) : 0;
      if (s.vib) f *= 1 + Math.sin(2 * Math.PI * s.vib[0] * t) * s.vib[1];
      ph += f / rate; ph -= Math.floor(ph);
      let x = 0;
      switch (s.w) {
        case 'sq': x = ph < (s.duty ?? 0.5) ? 1 : -1; break;
        case 'saw': x = ph * 2 - 1; break;
        case 'tri': x = Math.abs(ph * 4 - 2) - 1; break;
        case 'sin': x = Math.sin(ph * 2 * Math.PI); break;
        case 'noise': lp += (rnd() - lp) * (1 - (s.lp ?? 0)); x = lp * (1 + (s.lp ?? 0) * 1.5); break;
      }
      const env = Math.min(1, t / atk) * Math.pow(1 - u, s.curve ?? 1.6);
      out[i0 + i] += x * env * v;
    }
  }
  for (let i = 0; i < len; i++) out[i] = Math.max(-1, Math.min(1, out[i] * 0.9));
  return out;
}
