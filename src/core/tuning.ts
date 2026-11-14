/** Every number of GAME_DESIGN sections 5 to 9 in one frozen object. Change a number here, never inline, and note it in docs/DECISIONS.md. */
export const T = Object.freeze({
  // ---- players (GAME_DESIGN 6.1)
  accel: 600, brake: 900, yFactor: 0.9, carrySpeed: 0.92,
  staminaMax: 100, staminaRecover: 30, staminaWait: 0.5, staminaUnlock: 35,
  jumpV: 220, jumpG: 760,
  /** El salto (Nekketsu): Salto, or Tiro and Pase together, lifts the player `v` (he comes down in a bit over half a second; `cd` s on the ground
   *  before the next one). In the air he steers `air` of what he does on the ground and with the ball goes at `carry` of his speed. A ball
   *  between `lo` and `hi` px over his feet can be struck: from `headZ` up with the head, below with the foot, `prep` s after the press. He
   *  takes down a ball that is at most `ctrl` px over his feet (or `lo` under them). */
  jump: { v: 220, cd: 0.22, air: 0.4, carry: 0.85, lo: -8, hi: 46, headZ: 18, prep: 0.07 },
  /** La patada giratoria: Tiro in the air with the ball. Harder and straighter than a shot from the ground, and it counts as a shot first time
   *  for the keeper (he is slower to it). The player hangs in the air for the kick: he is lifted `hang` again when he starts it. */
  spin: { v: 430, vz: 24, err: 9, prep: 0.15, hang: 90 },
  /** La patada voladora: Tiro in the air without the ball. It knocks down the first rival it meets within `reach` px in front (`dy` to the
   *  sides, at most `z` px of difference in height) before the player lands, for at most `dur` s. */
  /** El codazo (Nekketsu: they do not only slide, they charge with the arm): Tiro without the ball with a rival ahead between the reach of a
   *  punch and `reach` px. He lunges at `v` for `dur` s and the first rival he meets goes down (`p`); if he meets nobody he stumbles `whiff` s. */
  elbow: { reach: 36, dy: 15, v: 255, dur: 0.24, hitX: 17, hitY: 12, p: 0.85, easyP: 0.55, whiff: 0.28, cd: 0.7, ai: 0.75 },
  flyKick: { reach: 24, dy: 14, z: 26, dur: 0.45 },
  /** Golpes y patadas (Nekketsu): Tiro without the ball next to a rival hits him. `reach`/`dy` in front, `p` lands, the victim stays down `down` s
   *  (`ko` s once he has taken `koAfter` hits within `combo` s), the attacker is busy `self` s and waits `cd` s. A child on easy controls who
   *  carries the ball is hit with `easyP`. */
  hit: { reach: 18, dy: 12, p: 0.9, easyP: 0.6, keep: 0.55, down: 1.6, ko: 3.4, koAfter: 3, combo: 6, self: 0.28, cd: 0.45, slack: { x: 5, y: 4 } },
  /** Who you move when your team has not got the ball: the nearest to it, after `wait` s on the last one (`waitEasy` for a child), if he is `margin` px nearer. */
  // who the control jumps to when the team has no ball: whoever gets to it first (seconds), and a mate the carrier has already passed counts
  // as `beaten` s later; it only jumps when the new one wins by `gain` s
  // (`keep`, `box`: while she steers a defender who is goal side and within `keep` px of the ball, or within `box` px of her own goal
  // line, the control never leaves him)
  switchCtl: { wait: 0.4, waitEasy: 0.5, margin: 20, beaten: 0.45, gain: 0.12, keep: 170, box: 130 },
  // orders to the mates (Nintendo World Cup): how long an order waits to be obeyed, how far from the ball the captain must be for Tiro to send
  // a mate at the carrier instead of sliding herself, and how near the mate has to be for the order to make sense
  order: { ttl: 1.2, tackleTtl: 2.2, far: 70, near: 260 },
  /** Speed of the match against real time on screen: below 1 the whole game runs slower, the way Nintendo World Cup feels. */
  pace: 0.8,
  /** Súper patada (Nekketsu): after `at` px of dribble without stopping, inside `range` of the goal, the player flashes for `window` s (`easyWindow`
   *  for a child) and Tiro then is a super shot. Its goal chance is `base` falling by `fall` across the range; it flies `durK` of a special's time. */
  super: { at: 200, still: 0.3, window: 0.6, easyWindow: 1.0, range: 420, base: 0.33, fall: 0.2, cap: 0.85, easyBonus: 0.1, durK: 0.8, hitR: 16, aiTake: 0.3 },
  /** Players sent flying (Nintendo World Cup): the push of a slide and of a power shot along the ground, how fast it fades, and the lift. One who
   *  comes down faster than `bounceMin` bounces once, with `bounce` of the speed he fell with. */
  fly: { slide: 150, slideVz: 190, shot: 230, shotVz: 280, fade: 0.45, steal: 110, stealVz: 150, bump: 160, bumpVz: 170, bounce: 0.4, bounceMin: 140 },
  // ---- ball (6.2)
  ballR: 3, gravity: 520, airDrag: 0.12, rollA: 40, rollB: 0.9, bounceV: 0.55, bounceH: 0.85, bounceMin: 50, spinAccel: 260, spinDecay: 1.2,
  ballMax: 600, postE: 0.7, netDamp: 0.2, postR: 2, postH: 28, barZ: 28,
  // ---- carrying and control (6.3)
  carryOff: { walk: 8, run: 11, sprint: 14, easyWalk: 6, easyRun: 8, easySprint: 10 },
  ctrl: { dx: 9, dy: 9, z: 16, zTarget: 36, maxSpeed: 360, easyDx: 14, easyDy: 14, easyMaxSpeed: 480 },
  deflectVx: -0.35, deflectVy: 110, immune: 0.35,
  /** Machacar (Nekketsu): every button a person presses while his player is down takes `cut` s off the time he stays there, never under `min` s in all. */
  mash: { cut: 0.16, min: 0.78 },
  /** La burla: Tiro next to a rival who is flat on the ground (within `reach` px, `dy` to the sides). The player laughs at him for `dur` s; the
   *  first laugh at each fall charges the star bar `bar`. */
  taunt: { reach: 26, dy: 16, dur: 0.75, bar: 4, cd: 0.6 },
  /** El remate combinado: a mate's pass struck in the air at goal (a header, a volley, an overhead kick) is a power shot with `bonus` more chance. */
  combo: { bonus: 0.15 },
  /** Sangre caliente (that is what Nekketsu means): a team that concedes and is `gap` goals behind burns for `dur` s. Its players run and
   *  shoot harder, hit more often, get up sooner and need less dribble for the súper patada. */
  fury: { gap: 2, dur: 20, speed: 1.12, power: 1.12, hit: 1.25, down: 0.7, superAt: 0.6 },
  /** Las trampas de cada cancha (hazards.ts). `size`: half the width and the depth of each on the ground. A puddle makes whoever sprints across
   *  it slip: he falls for `dur` s keeping `keep` of his speed, and the ball loses speed in it (`drag` per s).
   *  A geyser sleeps, smokes `warn` s and blows `blow` s every `period` s; whoever is on it goes up with `vz` and is down `dur` s; the ball
   *  goes up with `ball`. Mud slows everybody to `slow` of his speed (`easy` for a child) and stops the ball (`drag`). A cloud throws
   *  whoever steps on it up with `vz` (the ball with `ball`). After a trap gets a player he is safe from them for `cd` s. */
  haz: {
    size: { charco: [22, 12], geiser: [13, 9], barro: [40, 22], nube: [15, 9] } as Record<string, readonly number[]>,
    slip: { dur: 0.9, keep: 0.9, vz: 110, drag: 2.6 },
    geyser: { period: 7, warn: 0.9, blow: 0.8, vz: 270, dur: 1.0, ball: 300 },
    mud: { slow: 0.6, easy: 0.82, drag: 3.2 },
    cloud: { vz: 300, ball: 240, cd: 0.5 },
    cd: 1.6,
  },
  /** El balonazo (Nekketsu): a ball of a rival faster than `v` that hits a field player he cannot control knocks him down (`vz` lifts the ball). */
  ballHit: { v: 430, vz: 110 },
  // ---- kicks (6.4)
  kickCap: 560, passMin: 160, passMax: 360, passEnd: 70, lobSpeed: 170, lobMaxD: 320, passCone: 30 * Math.PI / 180, passConeWide: 50 * Math.PI / 180,
  passPrep: 0.08, shotPrep: 0.12, volleyPrep: 0.10, headerPrep: 0.18, chilenaPrep: 0.30, chilenaFloor: 0.5, kickRecover: 0.18,
  shotNormal: { v: 355, vz: 95, err: 5 }, shotHard: { v: 340, vzV: 80, err: 6 }, hardV: 180, hardVz: 90, hardErr: 8, hardTime: 0.5, tapTime: 0.15,
  volley: { v: 380, vz: 40, err: 12 }, header: { v: 280, vzDown: -20, vzUp: 60, err: 10 }, chilena: { v: 400, vz: 30, err: 12 },
  /** The banana of Nintendo World Cup: for `window` s after a person shoots, holding up or down bends the ball that way. */
  banana: { window: 0.6, rate: 4.5, max: 1.4 },
  lobHold: 0.25, autoFire: 0.9, effect: 0.6, effectHard: 0.8, passErr: 6, lobErr: 8,
  aerial: { dx: 22, dy: 18, zMin: 6, volleyZ: 24, headerZ: 52 }, firstTimeReach: 12,
  wallWindow: 1.2, wallLead: 40, wallBoost: 1.15,
  // ---- slide, steal, bump (6.5, 6.6)
  slide: { dur: 0.5, v0: 170, v1: 40, reach: 16, half: 8, ballZ: 10, kickV: 140, kickVy: 130, miss: 0.45, cd: 1.2, dizzy: 1.0, tumble: 0.7, ballStagger: 0.35 },
  steal: { reach: 14, dy: 11, p: 0.55, cd: 0.6, fail: 0.25, slack: { x: 4, y: 3 } },
  bump: { dx: 10, dy: 9, p: 0.45, cd: 1.0, victim: 0.3, self: 0.2, speed: 0.75 },
  // movement off the ball (mejora 2): the space search, the runs behind the last defender, the through pass and the pass-and-go (whoever passes runs ahead of the receiver, who can give it back: the one-two)
  space: { minX: 60, maxX: 160, safe: 30, runEvery: [2.5, 4.0] as readonly number[], runFor: 1.2, supportAt: 110, deepLead: 1.0, deepV: 40, goFor: 1.5, goAhead: 100, cutDist: 20, progressive: 0.12, progressHold: 0.6, progressGain: 50, cutAt: 0.55 },
  // shooting with judgement (mejora 3): the aim follows the stick (+-22 px), the keeper saves less the better the chance, a shot first time (the button pressed up to
  // `buffer` s before the ball arrives) is a better chance and surprises the keeper, and a tapped shot with the keeper off his line is a chip over him
  chance: { k: 1.3, neutral: 0.55, near: 60, far: 220, farFloor: 0.15, lateral: 72, lateralSpan: 168, lateralPen: 0.35, corner: 0.15, cornerGap: 21, traffic: 0.15, trafficDist: 14, first: 0.15, firstReact: 0.08, aim: 27 },
  buffer: 0.3, bufferArrive: 0.25,
  vasel: { out: 18, near: 70, range: 180, up: 21 },
  // crosses (mejora 2): a high pass from the wing in the last `zone` px goes to the far post, `snap` px around the spot is where a forward is picked up
  cross: { zone: 250, wing: 140, post: 38, far: 24, snap: 110, aiChance: 0.4 },
  /** A pass of the AI longer than this goes through the air (Nekketsu plays high: that is where the headers come from). */
  aiLob: 150,
  aerialTargetMult: 1.3,
  // contain (hold Pass without the ball): the player stays between the carrier and his goal; a tap shorter than tapMax switches player instead
  contain: { dist: 14, speed: 0.9, after: 0.5, stealBonus: 1.1, slow: 0.93, tapMax: 0.2 },
  getupFloor: 0.25,
  // ---- pitch rules (5)
  half: [60, 90, 120] as readonly number[],
  restart: { position: 0.8, aiMin: 0.8, aiMax: 1.2, humanAuto: 3.0, easyAuto: 1.2, kickoffAuto: 2.0, easyKickoffAuto: 1.2, wipe: 0.3, teleport: 40 },
  goalT: 2.3, goalSkip: 1.0, goldenT: 60, halftimeT: 3.5, endGrace: 1.0,
  throwMax: 160, throwInset: 60, cornerBox: 48,
  // free kick (tiro libre): a slide that hits the leg of the rival who carries the ball in the last `zone` px before the goal of the one who slides. The spot is never nearer than `minDist` to the goal line,
  // the wall of `wall` players stands `wallDist` px in front of the ball. The aim moves `aimV` px/s with the stick, the effect `curveV` per second, the meter swings `meterHz` times a second (sweet over `sweet`)
  free: { zone: 300, minDist: 120, maxDist: 230, ballNear: 40, wall: 2, wallDist: 40, wallGap: 13, zWall: 20, wallReach: 12, zGoal: [14, 22] as readonly number[], zBlock: 8, vMin: 220, vMax: 460, err: 5, spin: 0.9, aimV: 70, curveV: 1.4, sweep: 1.6, sweet: 0.78, ok: 0.25, aiMin: 1.2, aiMax: 2.0, aiErrK: 0.7, aiErrMin: 7, aiSweet: 0.25, aiBad: 0.25, auto: 25, q: [0.3, 0.55, 0.85] as readonly number[], aiQ: 0.6, cd: 35 },
  // ---- easy controls: a bit of help that is not shown to the children (GAME_DESIGN section 4)
  easy: { stolen: 0.6, helpAt: 0.7, passAhead: 50, passFree: 30, autoStick: 0.85, autoAfter: 0.3, autoDrain: 0.5, magnetR: 34, magnetA: 60, magnetSpeed: 200 },
  // ---- Barra Estrella and specials (7)
  bar: { max: 100, pass: 5, steal: 4, shot: 5, shotOff: 0, half: 0.5, conceded: 8, easyMult: 1.4, wall: 12, containSteal: 2, save: 8 },
  /** La carga del especial (Nekketsu: no film, the match never stops). Especial with the bar full: the shooter winds up `dur` s (`aiDur` when
   *  nobody presses for him) with a little bar over his head. A person lets it go with Tiro or Especial (not before `lock` s): in the yellow
   *  (`perfect`, fractions of the bar) the chance of a goal is the base times `mult` plus `pPerfect`, in the green (`good`) plus `pGood`, too
   *  soon or never just the base times `mult`. A child on easy controls has zones `easyWide` times wider around the same middle, and if she
   *  never presses it counts as green. With no person behind it the chance is the base. */
  // (`jog`: how fast he keeps moving while it loads, of his running speed)
  charge: { jog: 0.55, dur: 0.9, aiDur: 0.45, defDur: 0.75, lock: 0.12, good: [0.5, 0.96] as readonly number[], perfect: [0.66, 0.84] as readonly number[], mult: 0.69, pPerfect: 0.22, pGood: 0.10, dPerfect: 0.15, dGood: 0.07, easyWide: 2 },
  /** Los remates de poder en el aire (Nekketsu): Tiro in the air with the ball, or a header or an overhead kick at goal, inside `range` px of
   *  the goal, is the power shot of the player. Kicking it with the ball right at the top of the jump (falling or rising slower than `apexV`)
   *  adds `apex` to its chance. */
  airPower: { range: 420, apexV: 85, apex: 0.12 },
  // la palomita: running at least `minV` at a ball at the height of a volley, Tiro throws him flat at it. He flies `lunge` px/s until the
  // contact and slides on his belly after it, then he is `floor` s on the grass. A hard, low header; near the goal it is his power shot.
  dive: { minV: 95, v: 360, vz: 12, err: 9, prep: 0.14, hop: 105, lunge: 150, slide: 210, floor: 0.45, bonus: 0.06 },
  special: { zone: 0.7, own: 0.85, ayuda: 0.10, cap: 0.92, keeperMult: { tranquilos: 1.15, normales: 1.0, campeones: 0.9 } as Record<string, number>, aiRange: 400, aiDelayMin: 1, aiDelayMax: 3 },
  // ---- keepers (6.7)
  // (`clear`: how far from the goal line the rivals stay while the keeper has the ball in his hands; `clearFor`: s they keep going back after he lets it go)
  // (`thorPower`: what is left of the chance of a power shot or a special of the rivals against Thor)
  gk: { thorPower: 0.68, clear: 210, clearFor: 0.7, humanHold: 4, humanLock: 0.3, punt: 260, out: 0.12, outMin: 6, outMax: 28, area: 96, moveV: 150, diveV: 330, diveT: 0.6, land: 0.5, holdMin: 1.0, holdMax: 1.5, catchV: 380, looseV: 120,
        contact: 20, zReach: 30, punch: { vx: 160, vy: 230, vz: 120 }, tipOver: 0.25, speedPen: 300, speedPenSpan: 500, highPen: 0.8, farPen: 0.8, farFree: 6, rebound: 42,
        /** He stretches for any shot more than `diveAt` px from him that arrives within `diveIn` s (he no longer stands and watches it). */
        diveAt: 8, diveIn: 0.9,
        /** A power shot he stops stays in his hands with this times his skill; the rest he parries back into play. */
        superHold: 0.5,
        /** The angle: he stands on the line from the ball to the middle of his goal, `k0` of the way across with the ball far and `k1` with it
         *  inside `near` px (never more than `max` px from the middle), and comes `outNear` px off his line when a rival brings it that close. */
        angle: { k0: 0.35, k1: 0.62, near: 220, max: 30, outNear: 38, carrier: 170 },
        /** The one on one: a rival who carries the ball inside `zone` px of the goal line (`wide` px each side of the middle) with no defender
         *  within `free` px gets the keeper at his feet. At `contact` px he takes it with `p` times his skill (`easyP` from a child on easy
         *  controls); if he misses he is on the ground and the goal is open. He waits `cd` s before the next one. */
        rush: { zone: 105, wide: 70, free: 26, contact: 13, p: 0.8, easyP: 0.5, cd: 2.5 },
        /** A loose ball in his box slower than `v` is his when he is nearer to it than any rival (by `edge` px). */
        loose: { v: 220, area: 112, wide: 95, edge: 14 },
        /** A high ball that comes down inside `area` px of his line and `wide` px of the middle: he goes under it and takes it once it is
         *  below `z` px and within `reach` px of him, when it is slower than `v`. */
        claim: { area: 84, wide: 80, z: 40, reach: 12, v: 320 } },
});
export const SPECIAL_BASE = { arcoiris: 0.70, burbuja: 0.75, canonazo: 0.72, estrellas: 0.70, carrera: 0.72, relampago: 0.72 } as const;

/** Characters of the family (GAME_DESIGN section 2) and Juandi (#21, added at Rick's request). */
export const FAMILY = {
  sophie: { name: 'Sophie', run: 100, sprint: 1.35, stamina: 2.6, power: 1.0, passAcc: 1.0, control: 1.0, resist: 1.0, stolen: 1.0 },
  alana: { name: 'Alana', run: 92, sprint: 1.35, stamina: 2.2, power: 0.85, passAcc: 0.9, control: 1.15, resist: 0.8, stolen: 0.7 },
  papa: { name: 'Papá', run: 96, sprint: 1.30, stamina: 2.4, power: 1.25, passAcc: 0.9, control: 0.9, resist: 1.4, stolen: 0.9 },
  mama: { name: 'Mamá', run: 98, sprint: 1.35, stamina: 3.0, power: 0.95, passAcc: 1.15, control: 1.05, resist: 1.0, stolen: 0.95 },
  juandi: { name: 'Juandi', run: 99, sprint: 1.35, stamina: 2.7, power: 1.1, passAcc: 1.05, control: 1.0, resist: 1.0, stolen: 0.95 },
} as const;
export const FIELD_RIVAL = { run: 94, sprint: 1.3, stamina: 2.4, power: 1.0, passAcc: 1.0, control: 1.0, resist: 1.0, stolen: 1.0 } as const;
/** Keepers: reaction (s), reach of the dive (px), skill 0..1. */
/** The weather of the Waiting Room: rain multiplies the rolling friction, wind pushes a ball in the air (px/s² along x). */
export const WEATHER = { rainRoll: 1.45, wind: 70, rainSpeed: 0.96 } as const;
export const KEEPERS = {
  thor: { reaction: 0.16, reach: 46, skill: 0.86 }, mapache: { reaction: 0.32, reach: 42, skill: 0.60 }, tiburon: { reaction: 0.28, reach: 45, skill: 0.65 },
  buho: { reaction: 0.24, reach: 50, skill: 0.70 }, dragon: { reaction: 0.22, reach: 48, skill: 0.75 },
} as const;
/** How the family mates (always AI-controlled) play. They do not change with the difficulty of the rivals. */
export const MATES = { puddle: 0.75, gkRush: 1, gkClaim: 0.9, jumpShot: 0.25, speed: 0.92, reaction: 0.30, shotErr: 15, slideHuman: 0, press: 1, keeperSkill: 1, keeperReact: 0, star: 1, special: 0.5 } as const;
export const DIFFICULTY = {
  tranquilos: { puddle: 0.5, gkRush: 0, gkClaim: 0.15, jumpShot: 0.1, punch: 0.05, superTake: 0.15, speed: 0.70, reaction: 0.55, shotErr: 24, slideHuman: 0, press: 1, keeperSkill: 0.72, keeperReact: 0.12, star: 0.5, special: 0.35 },
  normales: { puddle: 0.75, gkRush: 0.5, gkClaim: 0.4, jumpShot: 0.25, punch: 0.3, superTake: 0.7, speed: 1.0, reaction: 0.25, shotErr: 14, slideHuman: 0.25, press: 1, keeperSkill: 1.2, keeperReact: 0.02, star: 0.75, special: 0.50 },
  campeones: { puddle: 0.9, gkRush: 0.85, gkClaim: 0.6, jumpShot: 0.35, punch: 0.5, superTake: 0.75, speed: 1.00, reaction: 0.18, shotErr: 9, slideHuman: 0.5, press: 2, keeperSkill: 1.3, keeperReact: -0.05, star: 1.0, special: 0.60 },
} as const;

/** How each kingdom plays (mejora 5). The rivals of a species follow their style on top of the difficulty: `press` more players press the carrier, `steal` multiplies
 *  the chance of a front steal, `range` the distance of their shots, `speed` the run, `pass` and `cross` how often they play progressive passes and crosses,
 *  `counter` plays the long ball to the forward as soon as the ball is won, `resist` how hard they are to bump, `special` the chance of their special. */
export const STYLE = {
  mapache: { press: 0, steal: 1.4, range: 0.9, speed: 1, pass: 1, cross: 1, counter: 0, resist: 1, special: 1 },
  tiburon: { press: 0, steal: 1, range: 1, speed: 1.03, pass: 0.5, cross: 0.5, counter: 1, resist: 1, special: 1 },
  buho: { press: 0, steal: 1, range: 0.9, speed: 1.015, pass: 2.5, cross: 2.5, counter: 0, resist: 1, special: 1.05 },
  dragon: { press: 0, steal: 1, range: 1.3, speed: 1.02, pass: 0.8, cross: 1, counter: 0, resist: 1.25, special: 1.17 },
} as const;
/** The Cup gets harder with every date, on top of the difficulty (mejora 5): the rivals run a bit faster and react a bit sooner. */
export const ARC = { speed: [1.0, 1.02, 1.04, 1.06] as readonly number[], react: [0, 0.02, 0.03, 0.05] as readonly number[] };
