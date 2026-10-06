import type { MatchEvent } from '../core/types';
import type { AudioApi } from '../app/services';
import { FX_TO_SFX, SFX, renderSfx } from './sfx';
import { SONGS, songBar, stepSeconds, type NoteEv } from './songs';

const midiHz = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);
const LOOKAHEAD = 0.25;
/** Effects that may repeat quickly get a minimum gap so a crowd of events never turns into noise. */
const MIN_GAP: Record<string, number> = { star: 0.04, kick: 0.04, pass: 0.04, bounce: 0.08, post: 0.06, bump: 0.05, steal: 0.05, whiff: 0.1, catch: 0.1 };
const VARY = new Set<string>(['star', 'kick', 'pass', 'bump', 'bounce', 'steal']);

/** Web Audio implementation of AudioApi. Nothing starts before the first user gesture (browsers require it). */
export class AudioEngine implements AudioApi {
  private ctx: AudioContext | null = null;
  private master!: GainNode; private musicBus!: GainNode; private sfxBus!: GainNode;
  private buffers = new Map<string, AudioBuffer>();
  private noiseBuf: AudioBuffer | null = null;
  private pulse: PeriodicWave | null = null;
  private vol = { music: 0.7, sfx: 0.8, muted: false, crowd: 0.7 };
  private crowdBus: GainNode | null = null; private crowdOn = false; private swellT = 0; private swellL = 0;
  private song: string | null = null; private wanted: string | null = null;
  private songGain: GainNode | null = null;
  private bar = 0; private nextBarT = 0; private timer: number | undefined;
  private lastPlay = new Map<string, number>();
  private analyser: AnalyserNode | null = null; private tap: Float32Array<ArrayBuffer> | null = null;
  private paused = false;
  /** Names of the sounds played, newest last. Read by the tests. */
  readonly log: string[] = [];

  constructor() {
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.suspend(); else if (!this.paused) this.resume(); });
  }

  // ------------------------------------------------------------------ AudioApi
  unlock(): void {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      try { this.ctx = new AC(); } catch { return; }
      const c = this.ctx;
      this.master = c.createGain(); this.musicBus = c.createGain(); this.sfxBus = c.createGain();
      const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
      this.crowdBus = c.createGain(); this.crowdBus.gain.value = 0; this.crowdBus.connect(this.master);
      this.musicBus.connect(this.master); this.sfxBus.connect(this.master); this.master.connect(comp); comp.connect(c.destination);
      this.analyser = c.createAnalyser(); this.analyser.fftSize = 1024; comp.connect(this.analyser); this.tap = new Float32Array(new ArrayBuffer(4096));
      this.applyVolumes();
      for (const [k, d] of Object.entries(SFX)) {
        const data = renderSfx(d, c.sampleRate);
        const b = c.createBuffer(1, data.length, c.sampleRate);
        b.getChannelData(0).set(data);
        this.buffers.set(k, b);
      }
      const nb = c.createBuffer(1, c.sampleRate, c.sampleRate), nd = nb.getChannelData(0);
      let seed = 7; for (let i = 0; i < nd.length; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; nd[i] = seed / 4294967296 * 2 - 1; }
      this.noiseBuf = nb;
      // the stands: looped noise through a band that sounds like many voices, with a slow wobble
      const cs = c.createBufferSource(); cs.buffer = nb; cs.loop = true;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 760; bp.Q.value = 0.45;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
      const lfo = c.createOscillator(); lfo.frequency.value = 0.31; const lg = c.createGain(); lg.gain.value = 140; lfo.connect(lg); lg.connect(bp.frequency); lfo.start();
      cs.connect(bp); bp.connect(lp); lp.connect(this.crowdBus!); cs.start();
      const re = new Float32Array(16), im = new Float32Array(16);
      for (let h = 1; h < 16; h++) im[h] = Math.sin(Math.PI * h * 0.25) / h;   // 25% pulse
      this.pulse = c.createPeriodicWave(re, im);
    }
    this.resume();
    if (this.wanted && !this.song) this.music(this.wanted);
  }

  setVolumes(music: number, sfx: number, muted: boolean, crowd = this.vol.crowd): void { this.vol = { music, sfx, muted, crowd }; this.applyVolumes(); }

  /** The stands murmur while a match is on. */
  crowd(on: boolean): void { this.crowdOn = on; this.swellT = 0; this.applyCrowd(); }
  /** The stands react: `level` 0..1 on top of the murmur, fading over `secs`. */
  swell(level: number, secs: number): void {
    if (!this.ctx || !this.crowdBus || !this.crowdOn) return;
    this.swellL = Math.max(this.swellL, level); this.swellT = secs;
    const t = this.ctx.currentTime, g = this.crowdBus.gain, target = this.crowdTarget(level);
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(target, t + 0.12); g.linearRampToValueAtTime(this.crowdTarget(0), t + 0.12 + secs);
  }
  private crowdTarget(extra: number): number { return this.crowdOn && !this.vol.muted ? this.vol.crowd * (0.1 + extra * 0.85) : 0; }
  private applyCrowd(): void { if (!this.ctx || !this.crowdBus) return; const t = this.ctx.currentTime; this.crowdBus.gain.cancelScheduledValues(t); this.crowdBus.gain.setTargetAtTime(this.crowdTarget(0), t, 0.4); }

  music(name: string | null): void {
    this.wanted = name;
    if (!this.ctx) return;
    if (name === this.song) return;
    window.clearInterval(this.timer);
    if (this.songGain) {   // the old tune fades out quickly, notes already scheduled die with it
      const old = this.songGain, t = this.ctx.currentTime;
      old.gain.cancelScheduledValues(t); old.gain.setValueAtTime(old.gain.value, t); old.gain.linearRampToValueAtTime(0, t + 0.12);
      window.setTimeout(() => old.disconnect(), 400);
      this.songGain = null;
    }
    this.song = name;
    if (!name || !SONGS[name]) { this.song = null; return; }
    this.songGain = this.ctx.createGain(); this.songGain.connect(this.musicBus);
    this.bar = 0; this.nextBarT = this.ctx.currentTime + 0.08;
    this.timer = window.setInterval(() => this.pump(), 60);
    this.pump();
  }

  ui(name: string): void { this.play(name); }

  pause(on: boolean): void {
    this.paused = on;
    if (on) this.suspend(); else this.resume();
  }

  onFx(e: MatchEvent): void {
    if (e.k === 'count') { this.play('count', e.v === 1 ? 1.12 : 1); return; }
    if (e.k === 'bounce' && (e.v ?? 0) < 90) return;   // a ball that rolls on does not tick
    const s = e.k === 'whistle' ? (e.v === 3 ? 'whistle3' : e.v === 2 ? 'whistle2' : 'whistle') : e.k === 'goal' ? null : FX_TO_SFX[e.k];
    if (e.k === 'goal') { this.play('net'); this.play('goal'); this.swell(1, 4.2); return; }
    if (e.k === 'special') this.swell(0.55, 1.6);
    else if (e.k === 'save' || e.k === 'post' || e.k === 'bar') this.swell(0.5, 1.4);
    else if (e.k === 'kick' && (e.v ?? 0) > 430) this.swell(0.22, 0.9);
    else if (e.k === 'whistle' && e.v === 3) this.swell(0.8, 3.2);
    else if (e.k === 'starfull') this.swell(0.3, 1.2);
    else if (e.k === 'golden' || e.k === 'penstart') this.swell(0.7, 2.4);
    if (s) this.play(s);
  }

  // ------------------------------------------------------------------ internals
  private applyVolumes(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.vol.muted ? 0 : 1, t, 0.02);
    this.musicBus.gain.setTargetAtTime(this.vol.music * 0.8, t, 0.02);
    this.sfxBus.gain.setTargetAtTime(this.vol.sfx, t, 0.02);
    this.applyCrowd();
  }
  private suspend(): void { void this.ctx?.suspend?.(); }
  private resume(): void { if (this.ctx && this.ctx.state !== 'running') void this.ctx.resume?.(); }

  /** Plays one effect. Public so the sound test board can use it. */
  play(name: string, rate = 1): void {
    const c = this.ctx, b = this.buffers.get(name);
    if (!c || !b || this.vol.muted || this.vol.sfx <= 0) return;
    const now = c.currentTime;
    const gap = MIN_GAP[name] ?? 0;
    if (now - (this.lastPlay.get(name) ?? -9) < gap) return;
    this.lastPlay.set(name, now);
    const src = c.createBufferSource();
    src.buffer = b;
    src.playbackRate.value = rate * (VARY.has(name) ? 0.94 + Math.random() * 0.14 : 1);
    src.connect(this.sfxBus);
    src.start();
    this.log.push(name); if (this.log.length > 200) this.log.shift();
  }

  private pump(): void {
    const c = this.ctx;
    if (!c || !this.song || c.state !== 'running') return;
    const s = SONGS[this.song];
    while (this.nextBarT < c.currentTime + LOOKAHEAD) {
      for (const ev of songBar(s, this.bar)) this.note(ev, this.nextBarT + ev.t);
      this.nextBarT += stepSeconds(s) * 16;
      this.bar++;
    }
  }

  private note(ev: NoteEv, at: number): void {
    const c = this.ctx!;
    const g = c.createGain();
    g.connect(this.songGain ?? this.musicBus);
    const end = at + ev.dur;
    if (ev.voice === 'kick') {
      const o = c.createOscillator(); o.frequency.setValueAtTime(150, at); o.frequency.exponentialRampToValueAtTime(40, at + 0.1);
      g.gain.setValueAtTime(ev.vol, at); g.gain.exponentialRampToValueAtTime(0.001, at + 0.12);
      o.connect(g); o.start(at); o.stop(at + 0.14); return;
    }
    if (ev.voice === 'snare' || ev.voice === 'hat') {
      const n = c.createBufferSource(); n.buffer = this.noiseBuf; n.loop = true;
      const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = ev.voice === 'hat' ? 7000 : 1500;
      g.gain.setValueAtTime(ev.vol, at); g.gain.exponentialRampToValueAtTime(0.001, at + (ev.voice === 'hat' ? 0.04 : 0.13));
      n.connect(f); f.connect(g); n.start(at); n.stop(at + 0.15); return;
    }
    const o = c.createOscillator();
    if (ev.voice === 'lead' || ev.voice === 'arp') { if (this.pulse) o.setPeriodicWave(this.pulse); else o.type = 'square'; }
    else if (ev.voice === 'harm') o.type = 'triangle';
    else o.type = 'triangle';
    o.frequency.value = midiHz(ev.midi);
    const a = Math.min(0.01, ev.dur / 4);
    g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(ev.vol, at + a);
    g.gain.setValueAtTime(ev.vol, Math.max(at + a, end - 0.04)); g.gain.linearRampToValueAtTime(0, end);
    o.connect(g); o.start(at); o.stop(end + 0.02);
  }

  /** RMS level of what is going to the speakers right now, 0..1. Used by the sound board meter and the browser tests. */
  level(): number {
    if (!this.analyser || !this.tap) return 0;
    this.analyser.getFloatTimeDomainData(this.tap);
    let s = 0; for (const v of this.tap) s += v * v;
    return Math.sqrt(s / this.tap.length);
  }
  /** Test hook: the song that is playing now. */
  get current(): string | null { return this.song; }
  get running(): boolean { return this.ctx?.state === 'running'; }
}
