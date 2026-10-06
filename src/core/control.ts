import { emptyInput, type InputFrame } from './types';
import { etaTo } from './ai/predict';
import { DIFFICULTY, MATES, T } from './tuning';
import type { HumanCtl, Match, Player } from './state';

export const setHumanInput = (m: Match, slot: number, frame: InputFrame | null): void => { m.hin[slot] = frame; };

const field = (m: Match, team: number): Player[] => m.players.filter((p) => p.team === team && p.role !== 'gk');
const byId = (m: Match, id: number): Player | undefined => m.players.find((p) => p.id === id);

/** The player each human should be moving now (GAME_DESIGN section 4, change to the nearest). Null means keep the current one. */
function wanted(m: Match, h: HumanCtl, taken: Set<number>): Player | null {
  const cur = byId(m, h.id)!, b = m.ball, mates = field(m, h.team).filter((p) => !taken.has(p.id));
  // a restart: the human takes the taker (the keeper is always the AI)
  if ((m.phase === 'restart' || m.phase === 'kickoff') && m.restart && m.restart.team === h.team) {
    const t = byId(m, m.restart.taker);
    if (t && t.role !== 'gk' && !taken.has(t.id)) return t;
    return null;
  }
  // a pass in the air: the receiver, from the moment of the kick
  const lp = m.lastPass;
  if (lp && lp.team === h.team && b.state === 'free' && Math.abs(b.lastTouch.t - lp.t) < 0.01 && b.lastTouch.player === lp.from && m.t - lp.t < 3.5) {
    const r = byId(m, lp.to);
    if (r && r.role !== 'gk' && !taken.has(r.id)) return r;
  }
  // my team has the ball: the one who carries it
  const owner = byId(m, b.owner ?? -1);
  if (owner && owner.team === h.team && owner.role !== 'gk' && !taken.has(owner.id)) return owner;
  if (owner && owner.team === h.team) return null;
  // loose ball or a rival with it: whoever arrives first, with hysteresis so the control does not jump about
  const easy = h.controls === 'easy';
  const wait = easy ? 0.8 : 0.5;
  if (m.t - h.since < wait) return null;
  let best: Player | null = null, be = Infinity;
  for (const p of mates) { const e = etaTo(m, p); if (e < be) { be = e; best = p; } }
  if (!best || best.id === cur.id) return null;
  if (easy) { if (Math.hypot(cur.x - b.x, cur.y - b.y) <= 80) return null; }
  else if (etaTo(m, cur) <= be + 0.25) return null;
  return best;
}

function assign(m: Match, h: HumanCtl, p: Player): void {
  const old = byId(m, h.id);
  if (old && old.id !== p.id) {
    old.control = 'ai'; old.humanSlot = null; old.input = emptyInput(); old.shoot.down = false; old.pass.down = false;
    old.baseSpeed = old.speedMult = old.team === 1 ? DIFFICULTY[m.difficulty].speed : MATES.speed;
  }
  p.baseSpeed = p.speedMult = 1;
  p.control = 'human'; p.humanSlot = h.slot; p.controls = h.controls; p.shoot.down = false; p.pass.down = false;
  h.id = p.id; h.since = m.t;
}

/** Gives every human the right player and writes the human frames into them. Runs first in every step. */
export function updateControl(m: Match): void {
  if (!m.humans.length) return;
  const taken = new Set<number>(m.humans.map((h) => h.id));
  const order = [...m.humans].sort((a, c) => {
    // two humans on one team: the one whose player is nearest to the ball chooses first
    const da = Math.hypot(byId(m, a.id)!.x - m.ball.x, byId(m, a.id)!.y - m.ball.y), dc = Math.hypot(byId(m, c.id)!.x - m.ball.x, byId(m, c.id)!.y - m.ball.y);
    return da - dc;
  });
  for (const h of order) {
    taken.delete(h.id);
    const w = wanted(m, h, taken);
    if (w && w.id !== h.id) assign(m, h, w);
    taken.add(h.id);
  }
  for (const h of m.humans) { const p = byId(m, h.id)!; p.input = m.hin[h.slot] ?? emptyInput(); }
}
void T;
