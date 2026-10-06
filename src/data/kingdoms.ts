import type { Species } from '../core/types';
import type { StadiumId, TimeOfDay } from '../view/Stadium';

export type KingdomId = 'bosque' | 'arrecife' | 'nubes' | 'volcan';
export interface Kingdom {
  id: KingdomId; species: Species; stadium: StadiumId; name: string; team: string; time: TimeOfDay; color: string; trophy: string;
}
/** The four kingdoms in the order of the Cup (GAME_DESIGN sections 2, 3 and 11). The last one is the final. */
export const KINGDOMS: Kingdom[] = [
  { id: 'bosque', species: 'mapache', stadium: 'bosque', name: 'Bosque Arcoíris', team: 'Mapachitos', time: 'sunset', color: '#FF8A2A', trophy: 'Copa del Bosque' },
  { id: 'arrecife', species: 'tiburon', stadium: 'arrecife', name: 'Arrecife Coral', team: 'Tiburoncitos', time: 'day', color: '#2F5FA8', trophy: 'Copa del Arrecife' },
  { id: 'nubes', species: 'buho', stadium: 'nubes', name: 'Nube Alta', team: 'Búhos', time: 'sunset', color: '#E8B83A', trophy: 'Copa de las Nubes' },
  { id: 'volcan', species: 'dragon', stadium: 'volcan', name: 'Volcán Dragón', team: 'Dragoncitos', time: 'night', color: '#E8423A', trophy: 'Copa del Volcán' },
];
export const kingdomOf = (sp: Species): Kingdom => KINGDOMS.find((k) => k.species === sp)!;
export const kingdomById = (id: KingdomId): Kingdom => KINGDOMS.find((k) => k.id === id)!;
