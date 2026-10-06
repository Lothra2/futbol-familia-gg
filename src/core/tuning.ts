/** Every number of GAME_DESIGN sections 5 to 9 in one frozen object. Change a number here, never inline, and note it in docs/DECISIONS.md. */
export const T = Object.freeze({
  // ---- players (GAME_DESIGN 6.1)
  accel: 600, brake: 900, yFactor: 0.7, carrySpeed: 0.92,
  staminaMax: 100, staminaRecover: 30, staminaWait: 0.5, staminaUnlock: 35,
  jumpV: 220, jumpG: 760,
  // ---- ball (6.2)
  ballR: 3, gravity: 520, airDrag: 0.12, rollA: 40, rollB: 0.9, bounceV: 0.55, bounceH: 0.85, bounceMin: 50, spinAccel: 260, spinDecay: 1.2,
  ballMax: 600, postE: 0.7, netDamp: 0.2, postR: 2, postH: 28, barZ: 28,
  // ---- carrying and control (6.3)
  carryOff: { walk: 8, run: 11, sprint: 14, easyWalk: 6, easyRun: 8, easySprint: 10 },
  ctrl: { dx: 9, dy: 7, z: 16, zTarget: 36, maxSpeed: 360, easyDx: 14, easyDy: 11, easyMaxSpeed: 480 },
  deflectVx: -0.35, deflectVy: 40, immune: 0.35,
  // ---- kicks (6.4)
  kickCap: 560, passMin: 160, passMax: 360, passEnd: 70, lobSpeed: 170, lobMaxD: 320, passCone: 30 * Math.PI / 180, passConeWide: 50 * Math.PI / 180,
  passPrep: 0.08, shotPrep: 0.12, volleyPrep: 0.10, headerPrep: 0.25, chilenaPrep: 0.30, chilenaFloor: 0.5, kickRecover: 0.18,
  shotNormal: { v: 320, vz: 100, err: 6 }, shotHard: { v: 340, vzV: 80, err: 6 }, hardV: 180, hardVz: 90, hardErr: 8, hardTime: 0.5, tapTime: 0.15,
  volley: { v: 380, vz: 40, err: 12 }, header: { v: 280, vzDown: -20, vzUp: 60, err: 10 }, chilena: { v: 400, vz: 30, err: 12 },
  lobHold: 0.25, autoFire: 0.9, effect: 0.6, effectHard: 0.8, passErr: 6, lobErr: 8,
  aerial: { dx: 18, dy: 10, zMin: 6, volleyZ: 24, headerZ: 48 }, firstTimeReach: 12,
  wallWindow: 1.2, wallLead: 40, wallBoost: 1.15,
  // ---- slide, steal, bump (6.5, 6.6)
  slide: { dur: 0.5, v0: 170, v1: 40, reach: 16, half: 6, ballZ: 10, kickV: 140, kickVy: 50, miss: 0.45, cd: 1.2, dizzy: 1.0, tumble: 0.7, ballStagger: 0.35 },
  steal: { reach: 14, dy: 8, p: 0.55, cd: 0.6, fail: 0.25, slack: { x: 4, y: 2 } },
  bump: { dx: 10, dy: 6, p: 0.45, cd: 1.0, victim: 0.3, self: 0.2, speed: 0.75 },
  // movement off the ball (mejora 2): the space search, the runs behind the last defender, the through pass and the pass-and-go (whoever passes runs ahead of the receiver, who can give it back: the one-two)
  space: { minX: 60, maxX: 160, safe: 30, runEvery: [2.5, 4.0] as readonly number[], runFor: 1.2, supportAt: 110, deepLead: 1.0, deepV: 40, goFor: 1.5, goAhead: 100, cutDist: 16, progressive: 0.12, progressHold: 0.6, progressGain: 50, cutAt: 0.55 },
  // shooting with judgement (mejora 3): the aim follows the stick (+-22 px), the keeper saves less the better the chance, a shot first time (the button pressed up to
  // `buffer` s before the ball arrives) is a better chance and surprises the keeper, and a tapped shot with the keeper off his line is a chip over him
  chance: { k: 1.3, neutral: 0.55, near: 60, far: 220, farFloor: 0.15, lateral: 24, lateralSpan: 56, lateralPen: 0.35, corner: 0.15, cornerGap: 14, traffic: 0.15, trafficDist: 10, first: 0.15, firstReact: 0.08, aim: 18 },
  buffer: 0.3, bufferArrive: 0.25,
  vasel: { out: 18, near: 70, range: 180, up: 14 },
  // crosses (mejora 2): a high pass from the wing in the last `zone` px goes to the far post, `snap` px around the spot is where a forward is picked up
  cross: { zone: 220, wing: 40, post: 38, far: 16, snap: 60, aiChance: 0.15 },
  aerialTargetMult: 1.3,
  // contain (hold Pass without the ball): the player stays between the carrier and his goal; a tap shorter than tapMax switches player instead
  contain: { dist: 14, speed: 0.9, after: 0.5, stealBonus: 1.1, slow: 0.93, tapMax: 0.2 },
  getupFloor: 0.25,
  // ---- pitch rules (5)
  half: [60, 90, 120] as readonly number[],
  restart: { position: 0.8, aiMin: 0.8, aiMax: 1.2, humanAuto: 3.0, easyAuto: 1.2, kickoffAuto: 2.0, easyKickoffAuto: 1.2, wipe: 0.3, teleport: 40 },
  goalT: 2.8, goalSkip: 1.0, goldenT: 60, halftimeT: 3.5, endGrace: 1.0, cinemaT: { full: 3.5, short: 2.0, off: 0.6 },
  throwMax: 120, throwInset: 26, cornerBox: 48,
  // free kick (tiro libre): a slide that hits the leg of the rival who carries the ball in the last `zone` px before the goal of the one who slides. The spot is never nearer than `minDist` to the goal line,
  // the wall of `wall` players stands `wallDist` px in front of the ball. The aim moves `aimV` px/s with the stick, the effect `curveV` per second, the meter swings `meterHz` times a second (sweet over `sweet`)
  free: { zone: 300, minDist: 120, maxDist: 230, ballNear: 40, wall: 2, wallDist: 40, wallGap: 10, zWall: 20, wallReach: 12, zGoal: [14, 22] as readonly number[], zBlock: 8, vMin: 220, vMax: 460, err: 5, spin: 0.9, aimV: 70, curveV: 1.4, meterHz: 0.55, sweet: 0.88, ok: 0.55, aiMin: 1.2, aiMax: 2.0, aiErrK: 0.7, aiErrMin: 7, aiSweet: 0.25, aiBad: 0.25, auto: 6, easyAuto: 8, q: [0.2, 0.4, 0.6] as readonly number[], aiQ: 0.6, cd: 35 },
  // ---- easy controls: a bit of help that is not shown to the children (GAME_DESIGN section 4)
  easy: { stolen: 0.6, helpAt: 0.7, passAhead: 50, passFree: 30, autoStick: 0.85, autoAfter: 0.3, autoDrain: 0.5, magnetR: 30, magnetA: 60, magnetSpeed: 200 },
  // ---- Barra Estrella and specials (7)
  bar: { max: 100, pass: 5, steal: 4, shot: 5, shotOff: 0, half: 0.5, conceded: 8, easyMult: 1.4, wall: 12, containSteal: 2, save: 8 },
  // the AHORA ring inside the cinematic of a special (mejora 4): the result is rolled when the ring closes, with the base chance times `mult`, plus the bonus of the press
  ring: { mult: 0.69, perfect: 0.22, good: 0.10, defPerfect: 0.15, defGood: 0.07, wPerfect: 0.12, wGood: 0.30, easyMult: 3, centerFull: 0.42, centerShort: 0.38, early: 0.5 },
  special: { zone: 0.7, own: 0.85, ayuda: 0.10, cap: 0.92, skipAfter: 0.3, keeperMult: { tranquilos: 1.15, normales: 1.0, campeones: 0.9 } as Record<string, number>, aiRange: 400, aiDelayMin: 1, aiDelayMax: 3 },
  // ---- keepers (6.7)
  gk: { out: 0.12, outMin: 6, outMax: 28, area: 96, moveV: 120, diveV: 220, diveT: 0.6, land: 0.5, holdMin: 1.0, holdMax: 1.5, catchV: 380, looseV: 120,
        contact: 20, zReach: 30, punch: { vx: 160, vy: 80, vz: 120 }, speedPen: 300, speedPenSpan: 500, highPen: 0.8, farPen: 0.8, farFree: 4, rebound: 28 },
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
export const KEEPERS = {
  thor: { reaction: 0.20, reach: 34, skill: 0.75 }, mapache: { reaction: 0.32, reach: 30, skill: 0.60 }, tiburon: { reaction: 0.28, reach: 32, skill: 0.65 },
  buho: { reaction: 0.24, reach: 36, skill: 0.70 }, dragon: { reaction: 0.22, reach: 34, skill: 0.75 },
} as const;
/** How the family mates (always AI-controlled) play. They do not change with the difficulty of the rivals. */
export const MATES = { speed: 0.92, reaction: 0.30, shotErr: 10, slideHuman: 0, press: 1, keeperSkill: 1, keeperReact: 0, star: 1, special: 0.5 } as const;
export const DIFFICULTY = {
  tranquilos: { speed: 0.70, reaction: 0.55, shotErr: 16, slideHuman: 0, press: 1, keeperSkill: 0.65, keeperReact: 0.12, star: 0.5, special: 0.35 },
  normales: { speed: 1.0, reaction: 0.25, shotErr: 9, slideHuman: 0.25, press: 1, keeperSkill: 1.0, keeperReact: 0.02, star: 0.75, special: 0.50 },
  campeones: { speed: 1.00, reaction: 0.18, shotErr: 6, slideHuman: 0.5, press: 2, keeperSkill: 1.1, keeperReact: -0.05, star: 1.0, special: 0.60 },
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
