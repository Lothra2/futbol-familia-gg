import { describe, expect, it } from 'vitest';
import { FX_TO_SFX, SFX, renderSfx } from '../../src/audio/sfx';
import { SONGS, SONG_NAMES, songBar, songBars, stepSeconds } from '../../src/audio/songs';

describe('sound effects', () => {
  for (const [name, def] of Object.entries(SFX)) {
    it(`${name}: audible, finite, not clipping, short`, () => {
      const a = renderSfx(def, 44100);
      let peak = 0, sum = 0;
      for (const v of a) { expect(Number.isFinite(v)).toBe(true); peak = Math.max(peak, Math.abs(v)); sum += v * v; }
      expect(peak).toBeGreaterThan(0.05);
      expect(peak).toBeLessThanOrEqual(1);
      expect(Math.sqrt(sum / a.length)).toBeGreaterThan(0.015);
      expect(a.length / 44100).toBeLessThan(2.5);
    });
  }
  it('every mapped match event has a recipe', () => { for (const s of Object.values(FX_TO_SFX)) expect(SFX[s], s).toBeDefined(); });
  it('is deterministic', () => { expect(Array.from(renderSfx(SFX.whistle, 22050))).toEqual(Array.from(renderSfx(SFX.whistle, 22050))); });
});

describe('songs', () => {
  for (const name of SONG_NAMES) {
    it(`${name}: every bar has 16 steps, notes inside the bar, melody in a singable range`, () => {
      const s = SONGS[name];
      for (const sec of s.sections) {
        expect(sec.chords.length).toBe(sec.lead.length);
        for (const bar of sec.lead) expect(bar.trim().split(/\s+/).length, `${name}: "${bar}"`).toBe(16);
      }
      const barLen = stepSeconds(s) * 16;
      let lead = 0;
      for (let b = 0; b < songBars(s); b++) for (const ev of songBar(s, b)) {
        expect(ev.t).toBeGreaterThanOrEqual(0); expect(ev.t).toBeLessThan(barLen); expect(Number.isFinite(ev.midi)).toBe(true);
        if (ev.voice === 'lead') { lead++; expect(ev.midi).toBeGreaterThanOrEqual(48); expect(ev.midi).toBeLessThanOrEqual(96); }
      }
      expect(lead).toBeGreaterThan(30);
    });
  }
  it('bars wrap around the loop', () => { const s = SONGS.menu; expect(songBar(s, 0)).toEqual(songBar(s, songBars(s))); });
});
