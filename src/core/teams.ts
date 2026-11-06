import { FAMILY, FIELD_RIVAL, KEEPERS, STYLE } from './tuning';
import type { CharId, Species } from './types';
import { slotRole, type FormationId } from './field';
import type { PStats, Role } from './state';

export type TeamKind = 'family' | Species;
export interface Seat { slot: number; role: Role; stats: PStats; charId?: CharId; species?: Species; art: string }

export const SPECIES_NAME: Record<Species, string> = { dragon: 'Dragoncitos del Volcán', tiburon: 'Tiburoncitos del Arrecife', buho: 'Búhos de las Nubes', mapache: 'Mapachitos del Bosque' };
/** The six kids of every rival team (the keeper first), the same names as tools/nes/elenco.json. */
export const RIVAL_NAMES: Record<Species, string[]> = {
  // the athletes of the Nekketsu Olympic GG who play for each kingdom (tools/nes/olimpico.py), the keeper first
  dragon: ['Ba Hoa', 'Minh', 'Lan', 'Tuan', 'Ryu', 'Tetsu'],
  tiburon: ['Nerva', 'Ender', 'Yusmary', 'Jhonder', 'Goro', 'Tetsu'],
  buho: ['Carmen', 'Gabo', 'Yuli', 'Toto', 'Kenji', 'Goro'],
  mapache: ['Hernando', 'Andrés', 'Camila', 'Pipe', 'Kenji', 'Ryu'],
};

/** The six seats of a team (Nintendo World Cup): slot 0 keeper and five in the field, placed by the formation. */
export function roster(kind: TeamKind, squad: readonly FieldChar[] = DEFAULT_SQUAD, form: FormationId = '2-1-2'): Seat[] {
  if (kind === 'family') {
    const order = lineup(squad);
    return [
      { slot: 0, role: 'gk', charId: 'thor', art: 'thor', stats: { name: 'Thor', ...FIELD_RIVAL, keeper: { ...KEEPERS.thor } } },
      ...order.map((c, i): Seat => {
        const f = FAMILY[c];
        return { slot: i + 1, role: slotRole(i + 1, form), charId: c, art: c, stats: { name: f.name, run: f.run, sprint: f.sprint, stamina: f.stamina, power: f.power, passAcc: f.passAcc, control: f.control, resist: f.resist, stolen: f.stolen } };
      }),
    ];
  }
  return [0, 1, 2, 3, 4, 5].map((slot): Seat => ({
    slot, role: slotRole(slot, form), species: kind, art: slot === 0 ? `riv_${kind}_gk` : `riv_${kind}_${slot}`,
    stats: { name: RIVAL_NAMES[kind][slot], ...FIELD_RIVAL, ...(slot === 0 ? { keeper: { ...KEEPERS[kind] } } : { steal: STYLE[kind].steal, resist: FIELD_RIVAL.resist * STYLE[kind].resist }) },
  }));
}

/** The five of the family all play: the order is the slots 1 to 5 of the formation (defenders first, then the middle, then the forwards). */
export const FIELD_CHARS = ['papa', 'mama', 'sophie', 'alana', 'juandi'] as const;
export type FieldChar = typeof FIELD_CHARS[number];
export const DEFAULT_SQUAD: FieldChar[] = ['papa', 'mama', 'juandi', 'sophie', 'alana'];
/** The slot order of the five: the ones in `squad` first (in that order), then the rest, so all five always play. */
export function lineup(squad: readonly FieldChar[]): FieldChar[] {
  const out = squad.filter((c, i) => FIELD_CHARS.includes(c) && squad.indexOf(c) === i);
  for (const c of DEFAULT_SQUAD) if (!out.includes(c)) out.push(c);
  return out.slice(0, 5);
}
export function squadSeats(squad: readonly FieldChar[]): Partial<Record<FieldChar, number>> {
  const out: Partial<Record<FieldChar, number>> = {};
  lineup(squad).forEach((c, i) => { out[c] = i + 1; });
  return out;
}
