import type { Match } from './state';

/** One-shot facts for the view and the audio. Drained once per frame with drainEvents. */
export const emit = (m: Match, k: string, x: number, y: number, z = 0, who?: number, v?: number): void => { m.events.push({ k, x, y, z, who, v }); };
export function drainEvents(m: Match) { const out = m.events; m.events = []; return out; }
