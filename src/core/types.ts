export type CharId = 'sophie' | 'alana' | 'papa' | 'mama' | 'juandi' | 'thor';
export const CHAR_IDS: CharId[] = ['sophie', 'alana', 'papa', 'mama', 'juandi', 'thor'];
/** Shirt numbers shown over the head of the player (the sprite is too small to carry a readable number). */
export const JERSEY: Partial<Record<CharId, number>> = { juandi: 21 };
export type Species = 'dragon' | 'tiburon' | 'buho' | 'mapache';
export const SPECIES: Species[] = ['dragon', 'tiburon', 'buho', 'mapache'];

/** What one player (or the AI, which has no other interface) asks of a footballer in one step. See GAME_DESIGN section 4. */
export interface InputFrame {
  mx: number; my: number;
  shoot: boolean; pass: boolean; sprint: boolean; special: boolean;
  shootPressed: boolean; passPressed: boolean; specialPressed: boolean;
  /** Only the AI sets it: the player asks for a slide tackle instead of a frontal steal. */
  slide?: boolean;
}
export const emptyInput = (): InputFrame => ({
  mx: 0, my: 0, shoot: false, pass: false, sprint: false, special: false, shootPressed: false, passPressed: false, specialPressed: false,
});

/** One-shot facts for the view and the audio. Drained by the view each frame. */
export interface MatchEvent {
  k: string; // 'kick' | 'pass' | 'post' | 'net' | 'goal' | 'whistle' | 'save' | 'slide' | 'bump' | 'special' | 'crowd' | ...
  x: number; y: number; z: number;
  who?: number; // player id
  v?: number;
}
