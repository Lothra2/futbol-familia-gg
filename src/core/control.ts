import { emptyInput, type InputFrame } from './types';
import { etaTo } from './ai/predict';
import { DIFFICULTY, MATES, T } from './tuning';
import { DT } from './step';
import { aerialZone } from './actions';
import { attackDir, ownGoalX } from './field';
import { emit } from './events';
import type { HumanCtl, Match, Player } from './state';

export const setHumanInput = (m: Match, slot: number, frame: InputFrame | null): void => { m.hin[slot] = frame; };

const field = (m: Match, team: number): Player[] => m.players.filter((p) => p.team === team && p.role !== 'gk');
const byId = (m: Match, id: number): Player | undefined => m.players.find((p) => p.id === id);

/** The player each human should be moving now (GAME_DESIGN section 4, change to the nearest). Null means keep the current one. */
function wanted(m: Match, h: HumanCtl, taken: Set<number>, tap = false): Player | null {
  const cur = byId(m, h.id)!, b = m.ball, mates = field(m, h.team).filter((p) => !taken.has(p.id));
  // a goal: she keeps her player, who is celebrating (or looking at the floor)
  if (m.phase === 'goal') return null;
  // the captain (Nekketsu): always the same player
  if (h.fixed) return null;
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
  // a tap of Pass without the ball (full controls): switch at once to the one who arrives first, or to the second if that is the one I already drive
  if (tap) {
    const order = mates.map((p) => ({ p, e: etaTo(m, p) })).sort((a, c) => a.e - c.e);
    const pick = order[0]?.p.id === cur.id ? order[1]?.p : order[0]?.p;
    if (pick && pick.id !== cur.id) return pick;
    return null;
  }
  // loose ball or a rival with it (Nintendo World Cup): you always move the one of your team nearest to the ball. A short wait and a few px of
  // margin keep the control from flickering between two players at the same distance.
  if (m.t - h.since < (h.controls === 'easy' ? T.switchCtl.waitEasy : T.switchCtl.wait)) return null;
  const d = (p: Player): number => Math.hypot(p.x - b.x, p.y - b.y);
  // a rival carries it: the nearest is often the one he has just gone past, who can only chase. Whoever gets to the ball first counts, and a
  // mate who is already behind the carrier (not between him and our goal) counts as later, so the control goes to one who can still stop him
  const foe = owner && owner.team !== h.team ? owner : null;
  if (foe) {
    const fd = attackDir(foe.team);
    // she is driving a defender who is still between the rival and our goal, near him or back in our own area: that is her choice (to wait
    // for him, to cover the goal) and the control does not take the player away from her. A tap of Pase still changes it.
    const f = m.hin[h.slot], steering = !!f && Math.hypot(f.mx, f.my) > 0.3;
    if (steering && (cur.x - foe.x) * fd >= -4 && (d(cur) < T.switchCtl.keep || Math.abs(cur.x - ownGoalX(h.team)) < T.switchCtl.box)) return null;
    const score = (p: Player): number => etaTo(m, p) + ((p.x - foe.x) * fd < -4 ? T.switchCtl.beaten : 0);
    let best: Player | null = null, bs = Infinity;
    for (const p of mates) { const e = score(p); if (e < bs) { bs = e; best = p; } }
    if (!best || best.id === cur.id) return null;
    // she is on him already (or as near as the other): the control stays where it is
    if (d(cur) <= d(best) + T.switchCtl.margin && (cur.x - foe.x) * fd >= -4) return null;
    if (score(cur) <= bs + T.switchCtl.gain) return null;
    return best;
  }
  let best: Player | null = null, bd = Infinity;
  for (const p of mates) { const e = d(p); if (e < bd) { bd = e; best = p; } }
  if (!best || best.id === cur.id) return null;
  if (d(cur) <= bd + T.switchCtl.margin) return null;
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
    // a tap of Pass (released in under tapMax) asks for a switch; a long press is "contain" (see actions.ts) and never switches
    const f = m.hin[h.slot];
    let tap = false;
    if (f && h.controls === 'full') {
      if (f.pass) h.passT = (h.passT ?? 0) + DT;
      else { if (h.passWas && (h.passT ?? 0) < T.contain.tapMax) tap = true; h.passT = 0; }
      h.passWas = f.pass;
      const cur = byId(m, h.id);
      if (tap && cur && (aerialZone(m, cur) || m.ball.owner === cur.id)) tap = false;
    } else { h.passT = 0; h.passWas = false; }
    // while he contains a carrier the control does not wander to another player (a tap of Pass is a different gesture and cannot happen mid hold)
    const w = (byId(m, h.id)?.containT ?? 0) > 0 ? null : wanted(m, h, taken, tap);
    if (w && w.id !== h.id) assign(m, h, w);
    taken.add(h.id);
  }
  for (const h of m.humans) { const p = byId(m, h.id)!; p.input = m.hin[h.slot] ?? emptyInput(); }
  giveOrders(m);
}

/** Nintendo World Cup: with a mate of the AI on the ball, Pase is "pass it to me!" and Tiro is "shoot!"; and the captain, far from a rival
 *  who carries it, sends the nearest mate at him with Tiro. The press is an order, so her own player does nothing with it. */
function giveOrders(m: Match): void {
  if (m.phase !== 'play') return;
  const b = m.ball, owner = byId(m, b.owner ?? -1);
  for (const h of m.humans) {
    const me = byId(m, h.id)!, f = me.input;
    if (!f.shootPressed && !f.passPressed) continue;
    if (owner && owner.team === h.team && owner.id !== me.id && owner.control === 'ai' && owner.role !== 'gk' && b.state === 'owned') {
      const kind = f.passPressed ? 'pass' : 'shoot';
      owner.order = { kind, to: me.id, until: m.t + T.order.ttl }; owner.ai.nextThink = 0;
      emit(m, 'order', me.x, me.y, me.z, me.id, kind === 'pass' ? 0 : 1); emit(m, 'obey', owner.x, owner.y, owner.z, owner.id, kind === 'pass' ? 0 : 1);
      me.input = { ...f, shootPressed: false, passPressed: false, shoot: false, pass: false };
    } else if (h.fixed && f.shootPressed && !f.passPressed && owner && owner.team !== h.team && owner.role !== 'gk' && Math.hypot(me.x - b.x, me.y - b.y) > T.order.far) {
      const mate = field(m, h.team).filter((p) => p.control === 'ai' && !p.act && p.z <= 0 && Math.hypot(p.x - b.x, p.y - b.y) < T.order.near)
        .sort((a, c) => Math.hypot(a.x - b.x, a.y - b.y) - Math.hypot(c.x - b.x, c.y - b.y))[0];
      if (!mate || Math.hypot(mate.x - b.x, mate.y - b.y) >= Math.hypot(me.x - b.x, me.y - b.y)) continue;
      mate.order = { kind: 'tackle', to: me.id, until: m.t + T.order.tackleTtl }; mate.ai.nextThink = 0;
      emit(m, 'order', me.x, me.y, me.z, me.id, 2); emit(m, 'obey', mate.x, mate.y, mate.z, mate.id, 2);
      me.input = { ...f, shootPressed: false, shoot: false };
    }
  }
}
void T;
