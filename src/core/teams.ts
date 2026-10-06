import { FAMILY, FIELD_RIVAL, KEEPERS, STYLE } from './tuning';
import type { CharId, Species } from './types';
import type { PStats, Role } from './state';

export type TeamKind = 'family' | Species;
export interface Seat { slot: number; role: Role; stats: PStats; charId?: CharId; species?: Species }

export const SPECIES_NAME: Record<Species, string> = { dragon: 'Dragoncitos del Volcán', tiburon: 'Tiburoncitos del Arrecife', buho: 'Búhos de las Nubes', mapache: 'Mapachitos del Bosque' };
const SPECIES_SINGLE: Record<Species, string> = { dragon: 'Dragoncito', tiburon: 'Tiburoncito', buho: 'Búho', mapache: 'Mapachito' };

/** The five seats of a team. Slot 0 keeper, 1 and 2 defenders, 3 and 4 forwards (FORMATION in field.ts). */
export function roster(kind: TeamKind, squad: readonly FieldChar[] = DEFAULT_SQUAD): Seat[] {
  if (kind === 'family') {
    const field = (c: FieldChar, slot: number, role: Role): Seat => {
      const f = FAMILY[c];
      return { slot, role, charId: c, stats: { name: f.name, run: f.run, sprint: f.sprint, stamina: f.stamina, power: f.power, passAcc: f.passAcc, control: f.control, resist: f.resist, stolen: f.stolen } };
    };
    const seats = squadSeats(squad);
    const four = (Object.keys(seats) as FieldChar[]).sort((a, b) => seats[a]! - seats[b]!);
    return [
      { slot: 0, role: 'gk', charId: 'thor', stats: { name: 'Thor', ...FIELD_RIVAL, keeper: { ...KEEPERS.thor } } },
      ...four.map((c) => field(c, seats[c]!, seats[c]! <= 2 ? 'def' : 'fwd')),
    ];
  }
  const n = SPECIES_SINGLE[kind];
  return [0, 1, 2, 3, 4].map((slot): Seat => ({
    slot, role: slot === 0 ? 'gk' : slot < 3 ? 'def' : 'fwd', species: kind,
    stats: { name: slot === 0 ? `${n} portero` : n, ...FIELD_RIVAL, ...(slot === 0 ? { keeper: { ...KEEPERS[kind] } } : { steal: STYLE[kind].steal, resist: FIELD_RIVAL.resist * STYLE[kind].resist }) },
  }));
}

/** Who starts in the field. Thor is always the keeper. The five field characters share four seats: one rests (menu "Descansa"). */
export const FIELD_CHARS = ['papa', 'mama', 'sophie', 'alana', 'juandi'] as const;
export type FieldChar = typeof FIELD_CHARS[number];
export const DEFAULT_SQUAD: FieldChar[] = ['papa', 'mama', 'sophie', 'alana'];
/** Slots 1 and 2 are the defenders and 3 and 4 the forwards (FORMATION). The order below decides who defends. With the default squad it is
 *  Papá and Mamá at the back and Sophie and Alana in front, as always. */
const DEFEND_FIRST: FieldChar[] = ['papa', 'mama', 'juandi', 'sophie', 'alana'];
export function squadSeats(squad: readonly FieldChar[]): Partial<Record<FieldChar, number>> {
  const four = DEFEND_FIRST.filter((c) => squad.includes(c)).slice(0, 4);
  const out: Partial<Record<FieldChar, number>> = {};
  four.forEach((c, i) => { out[c] = i + 1; });
  return out;
}
