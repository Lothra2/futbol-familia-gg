import type { Btn } from '../input/router';

/** Button icons as inline SVG (the font has no emoji). 24x24 viewBox, drawn with the ink color. */
const INK = '#2A1B3D';
export const ICONS: Record<Btn | 'kick', string> = {
  shoot: `<svg viewBox="0 0 24 24" width="40" height="40"><circle cx="12" cy="12" r="9" fill="#FFF7EC" stroke="${INK}" stroke-width="2"/><path d="M12 7l3.5 2.6-1.3 4.1h-4.4L8.5 9.6z" fill="${INK}"/><path d="M12 7V3M15.5 9.6l4-1.2M14.2 13.7l2.4 3.4M9.8 13.7l-2.4 3.4M8.5 9.6l-4-1.2" stroke="${INK}" stroke-width="1.6" fill="none"/></svg>`,
  pass: `<svg viewBox="0 0 24 24" width="40" height="40"><path d="M3 12h13M12 6l7 6-7 6" stroke="${INK}" stroke-width="3.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  sprint: `<svg viewBox="0 0 24 24" width="40" height="40"><path d="M13 2L5 14h6l-1 8 9-13h-6z" fill="#FFD447" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/></svg>`,
  special: `<svg viewBox="0 0 24 24" width="40" height="40"><path d="M12 2l2.8 6.2 6.7.7-5 4.5 1.4 6.6L12 16.6 6.1 20l1.4-6.6-5-4.5 6.7-.7z" fill="#FFD447" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/></svg>`,
  kick: `<svg viewBox="0 0 24 24" width="48" height="48"><circle cx="12" cy="12" r="9" fill="#FFF7EC" stroke="${INK}" stroke-width="2"/><path d="M12 7l3.5 2.6-1.3 4.1h-4.4L8.5 9.6z" fill="${INK}"/><path d="M12 7V3M15.5 9.6l4-1.2M14.2 13.7l2.4 3.4M9.8 13.7l-2.4 3.4M8.5 9.6l-4-1.2" stroke="${INK}" stroke-width="1.6" fill="none"/></svg>`,
};
