import type { MatchEvent } from '../core/types';
import type { Match } from '../core/state';
import { T_ES } from '../data/text.es';
import { KIND_INDEX } from '../core/specials';

/** Priority of each line: a goal cuts whatever is being said, a small remark never cuts a bigger one. */
const PRIO: Record<string, number> = { goal: 3, final: 4, special: 2, save: 2, golden: 2, pen: 2, start: 2, half: 1, post: 1 };

/** The voice of the match: short lines in Spanish with the speech of the browser (no files, no network). */
export class Narrator {
  enabled = true;
  volume = 0.8;
  private busy = 0;
  private busyUntil = 0;
  private lastAt = new Map<string, number>();
  private rr = 0;
  private voice: SpeechSynthesisVoice | null = null;

  private synth(): SpeechSynthesis | null { try { return typeof speechSynthesis !== 'undefined' ? speechSynthesis : null; } catch { return null; } }

  private pick(): SpeechSynthesisVoice | null {
    if (this.voice) return this.voice;
    const list = this.synth()?.getVoices?.() ?? [];
    const es = list.filter((v) => /^es/i.test(v.lang));
    this.voice = es.find((v) => /es[-_](MX|US|419)/i.test(v.lang)) ?? es.find((v) => /es[-_]ES/i.test(v.lang)) ?? es[0] ?? null;
    return this.voice;
  }

  /** Says `text` now unless something more important is being said. `key` limits how often the same kind of line repeats. */
  say(text: string, kind: string, gap = 1.5): void {
    const s = this.synth();
    if (!s || !this.enabled || this.volume <= 0 || typeof SpeechSynthesisUtterance === 'undefined') return;
    const now = performance.now() / 1000, p = PRIO[kind] ?? 1;
    if (now - (this.lastAt.get(kind) ?? -99) < gap) return;
    if (now < this.busyUntil && p <= this.busy) return;
    try {
      if (s.speaking || s.pending) s.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'es-MX'; const v = this.pick(); if (v) { u.voice = v; u.lang = v.lang; }
      u.rate = 1.08; u.pitch = 1.12; u.volume = Math.min(1, this.volume);
      s.speak(u);
      this.lastAt.set(kind, now); this.busy = p; this.busyUntil = now + Math.min(4, 0.9 + text.length * 0.07);
    } catch { /* a browser without speech simply stays quiet */ }
  }

  stop(): void { try { this.synth()?.cancel(); } catch { /* ignore */ } this.busyUntil = 0; }

  private any(list: string[]): string { return list[this.rr++ % list.length]; }

  /** Turns an event of the match into a line (or nothing). */
  onEvent(e: MatchEvent, m: Match, rival: string): void {
    const who = e.who !== undefined ? m.players.find((p) => p.id === e.who) : undefined;
    switch (e.k) {
      case 'whistle':
        if (e.v === 1 && m.t < 1.5 && m.score[0] + m.score[1] === 0) this.say('¡Comienza el partido!', 'start');
        else if (e.v === 2) this.say('Terminó el primer tiempo.', 'half');
        break;
      case 'goal': {
        if (m.phase === 'penalties') { this.say(this.any(['¡Gol!', '¡Adentro!']), 'goal', 0.5); break; }
        const lg = m.lastGoal, mine = (e.v ?? lg?.team ?? 0) === 0, name = who?.name ?? '';
        if (mine) this.say(this.any([`¡Goooool de ${name || 'la familia'}!`, `¡Gol, gol, gol de ${name || 'la familia'}!`, `¡Qué golazo de ${name || 'la familia'}!`]), 'goal', 0.5);
        else this.say(this.any([`Gol de ${rival}. ¡Ánimo familia!`, 'Gol rival. A levantarse.', `Nos hicieron un gol. ¡A remontar!`]), 'goal', 0.5);
        break;
      }
      case 'special': { const t = (T_ES.specials[KIND_INDEX[e.v ?? 0]] ?? '').replace(/[¡!]/g, '').toLowerCase(); if (t) this.say(`¡${t}!`, 'special', 0.8); break; }
      case 'save':
        if (e.v !== 2 && m.phase === 'penalties') this.say('¡Atajó!', 'save', 0.5);
        else if (e.v !== 2) this.say(who?.charId === 'thor' ? this.any(['¡Atajadón de Thor!', '¡Thor lo paró!']) : '¡Qué atajada!', 'save', 3);
        break;
      case 'post': case 'bar': this.say('¡Al palo!', 'post', 3); break;
      case 'golden': this.say('¡Gol de oro! El próximo que marque gana.', 'golden'); break;
      case 'penstart': this.say('¡Se viene la tanda de penales!', 'pen'); break;
      case 'final': {
        const [a, b] = m.score, pw = m.penWinner;
        this.say(a > b || (a === b && pw === 0) ? 'Final del partido. ¡Ganó la familia!' : a === b && pw === null ? 'Final del partido. Empate.' : `Final del partido. Ganaron ${rival}.`, 'final');
        break;
      }
    }
  }
}
