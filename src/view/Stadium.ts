import Phaser from 'phaser';
import { CAM_MAX_X, CAM_MIN_X, GOAL, PITCH, AREA_BIG, AREA_SMALL, CENTER, PENALTY_X, pitchScreenTop } from '../core/field';
import { PAL } from './textures';
import { AISLE, ROW_H, SEAT, drawFan, makeFans, poseOf, type Fan, type FanKind, type FanPose } from './stadium/fans';
import { drawText, textWidth } from './stadium/font5';

export type TimeOfDay = 'day' | 'sunset' | 'night';
export type CrowdMode = 'high' | 'low';
export type StadiumId = 'volcan' | 'bosque' | 'arrecife' | 'nubes';

interface Theme {
  name: string; step: string; hi: string; lo: string; rail: string; mix: Partial<Record<FanKind, number>>; time: TimeOfDay; backdrop: string | null;
  /** A second painting of the same place at another hour: it is used when that hour is picked (and now and then when the hour is left to the kingdom). */
  alt?: { time: TimeOfDay; backdrop: string };
  led: string; ledColors: string[]; banner: [string, string]; lamp: string;
}
/** The look of each stadium (ART_BIBLE section 9). Only the Volcán has art for now; the others join in M9. */
export const THEMES: Record<StadiumId, Theme> = {
  volcan: {
    name: 'Estadio Volcán Dragón', step: '#6B5A7A', hi: '#8A7899', lo: '#4A3A5C', rail: '#FFD447', mix: { dragon: 0.7, human: 0.3 }, time: 'night', backdrop: 'bg_volcan', alt: { time: 'day', backdrop: 'bg2_volcan' },
    led: '¡VAMOS FAMILIA! * JUGO DE MANGO DEL BOSQUE * PANADERÍA LA NUBE * ¡GOOOL! * ', ledColors: ['#FFD447', '#FF6FB5', '#7BE3FF', '#5DDB43'], banner: ['#FFD447', '#2A1B3D'], lamp: '#FFF3B0',
  },
  bosque: { name: 'Estadio Bosque Arcoíris', step: '#4F8A7A', hi: '#6FAE9A', lo: '#356A5C', rail: '#FFD447', mix: { mapache: 0.7, human: 0.3 }, time: 'sunset', backdrop: 'bg_bosque', alt: { time: 'night', backdrop: 'bg2_bosque' }, led: '¡VAMOS FAMILIA! * ', ledColors: ['#FFD447', '#5DDB43'], banner: ['#5DDB43', '#2A1B3D'], lamp: '#FFF3B0' },
  arrecife: { name: 'Estadio Arrecife Coral', step: '#E08A7A', hi: '#F0A898', lo: '#B86A5C', rail: '#FFFFFF', mix: { tiburon: 0.7, human: 0.3 }, time: 'day', backdrop: 'bg_arrecife', alt: { time: 'night', backdrop: 'bg2_arrecife' }, led: '¡VAMOS FAMILIA! * ', ledColors: ['#7BE3FF', '#FF6FB5'], banner: ['#7BE3FF', '#2A1B3D'], lamp: '#FFF3B0' },
  nubes: { name: 'Estadio Nube Alta', step: '#E8E0D0', hi: '#FFFFFF', lo: '#C0B8A8', rail: '#FFD447', mix: { buho: 0.7, human: 0.3 }, time: 'sunset', backdrop: 'bg_nubes', alt: { time: 'day', backdrop: 'bg2_nubes' }, led: '¡VAMOS FAMILIA! * ', ledColors: ['#FFD447', '#FFFFFF'], banner: ['#FFD447', '#FFFFFF'], lamp: '#FFF3B0' },
};

const ABBR: Record<string, string> = { dragon: 'DRA', tiburon: 'TIB', buho: 'BUH', mapache: 'MAP' };
const COLOR: Record<string, string> = { dragon: '#FF8A2A', tiburon: '#5EA8FF', buho: '#E0B060', mapache: '#C8D0D8' };
const SW = 1040, ROWS = 9, BAND_H = ROWS * ROW_H, BAND_X = -64, PAR = 0.8;
const GRADE: Record<TimeOfDay, number> = { day: 0xffffff, sunset: 0xffc4a0, night: 0x6f78b8 };
const SKY: Record<TimeOfDay, string[]> = {
  day: ['#7BC8F2', '#9FE3FF', '#BFEFFF', '#DDF6FF'], sunset: ['#7A4A9A', '#C8607A', '#FF9E7A', '#FFD6A0'], night: ['#120A2E', '#1E1248', '#2E1C66', '#4A2A86'],
};

interface Rocket { x: number; y: number; vy: number; t: number; boom: number; col: number[]; burst: { x: number; y: number; vx: number; vy: number; life: number; c: number }[] | null }

/** The stadium: sky, far backdrop, light towers, stands with a live crowd, banners, LED boards, the pitch baked from the same constants the rules use,
 *  the near boards and the grading of the hour of the day. Everything is code except the backdrop and the mascot (AI art). */
export class Stadium {
  readonly theme: Theme;
  readonly time: TimeOfDay;
  private rivalKind(): string { const k = Object.keys(this.theme.mix).find((q) => q !== 'human'); return k ?? 'dragon'; }
  mode: CrowdMode;
  private auto: boolean;
  private fans: Fan[];
  private sky: Phaser.GameObjects.Graphics;
  private bgImg: Phaser.GameObjects.TileSprite | null = null;
  private towers: Phaser.GameObjects.Graphics;
  private glow: Phaser.GameObjects.Graphics;
  private crowdImg: Phaser.GameObjects.Image;
  private waveImg: Phaser.GameObjects.Image;
  private crest = -1;
  private fx: Phaser.GameObjects.Graphics;
  private banners: Phaser.GameObjects.Graphics;
  private video: Phaser.GameObjects.Image;
  private vcanvas: Phaser.Textures.CanvasTexture;
  private ledFar: Phaser.GameObjects.TileSprite;
  private ledNear: Phaser.GameObjects.TileSprite;
  private ground: Phaser.GameObjects.Rectangle;
  private pitch: Phaser.GameObjects.Image;
  private grade: Phaser.GameObjects.Rectangle;
  private pools: Phaser.GameObjects.Container;
  private wash: Phaser.GameObjects.Graphics;
  private mascot: Phaser.GameObjects.Sprite | null = null;
  private torches: Phaser.GameObjects.Sprite[] = [];
  private statue: Phaser.GameObjects.Sprite | null = null;
  private W = 426; private H = 240; private top = 64; private rows = 4; private camX = 0;
  private clock = 0;
  private cheerT = 0; private standT = 0; private waveT = -1; private nextWave = 40; private flashT = 0; private nameT = 0; private scorer = '';
  private rockets: Rocket[] = [];
  private score: [number, number] = [0, 0];
  private slow = 0; private slowFor = 0;
  /** Test hooks: when (on the stadium clock) the frames became slow and when the crowd went to its light mode. */
  slowStart = -1; lowAt = -1;
  private baked = new Set<string>();
  private frameKey = '';
  /** Test hooks: the state the crowd is in and its frame. */
  state: 'idle' | 'cheer' | 'stand' | 'wave' = 'idle'; frame = 0;
  /** True when the painting of the second hour is the one on screen. */
  altArt = false;

  /** The hour of a match left to the kingdom: usually its own, one in three the hour of the second painting. Real browsers only, tests and demos stay fixed. */
  static hourFor(id: StadiumId): TimeOfDay | undefined {
    const t = THEMES[id];
    if (!t.alt || typeof navigator === 'undefined' || navigator.webdriver) return undefined;
    return Math.random() < 0.34 ? t.alt.time : undefined;
  }

  constructor(private scene: Phaser.Scene, id: StadiumId = 'volcan', time?: TimeOfDay, crowd: CrowdMode | 'auto' = 'auto') {
    this.theme = THEMES[id]; this.time = time ?? this.theme.time;
    this.mode = crowd === 'low' ? 'low' : 'high'; this.auto = crowd === 'auto' || crowd === 'high';
    this.fans = makeFans(77, Math.floor(SW / SEAT), ROWS, this.theme.mix);
    scene.cameras.main.setBackgroundColor(SKY[this.time][0]);
    this.sky = scene.add.graphics().setDepth(0).setScrollFactor(0);
    const alt = this.theme.alt && this.time === this.theme.alt.time && scene.textures.exists(this.theme.alt.backdrop) ? this.theme.alt.backdrop : null;
    this.altArt = alt !== null;
    const key = alt ?? this.theme.backdrop;
    if (key && scene.textures.exists(key)) this.bgImg = scene.add.tileSprite(0, 0, 10, 10, key).setOrigin(0, 0).setDepth(5).setScrollFactor(0);
    else this.makeBackdrop();
    this.wash = scene.add.graphics().setDepth(6).setScrollFactor(0);
    this.towers = scene.add.graphics().setDepth(8).setScrollFactor(PAR);
    this.crowdImg = scene.add.image(BAND_X, 0, 'ball').setOrigin(0, 1).setDepth(10).setScrollFactor(PAR);
    this.waveImg = scene.add.image(BAND_X, 0, 'ball').setOrigin(0, 1).setDepth(11).setScrollFactor(PAR).setVisible(false);
    this.banners = scene.add.graphics().setDepth(12).setScrollFactor(PAR);
    this.fx = scene.add.graphics().setDepth(13).setScrollFactor(PAR);
    this.vcanvas = scene.textures.createCanvas(`video_${Math.random().toString(36).slice(2)}`, 72, 26)!;
    this.video = scene.add.image(0, 0, this.vcanvas).setOrigin(0.5, 1).setDepth(3601).setScrollFactor(PAR);   // above the grading: a screen glows at night
    this.ground = scene.add.rectangle(0, 0, 10, 10, 0x4aa88e).setOrigin(0, 0).setDepth(15).setScrollFactor(0);
    this.ledFar = scene.add.tileSprite(0, 0, 10, 16, this.ledTexture('led_far', 0.7)).setOrigin(0, 0).setDepth(20).setScrollFactor(0);
    this.ledNear = scene.add.tileSprite(0, 0, 10, 16, this.ledTexture('led_near', 1)).setOrigin(0, 0).setDepth(3600).setScrollFactor(0);
    if (!scene.textures.exists('pitch')) this.bakePitch();
    this.pitch = scene.add.image(CAM_MIN_X - 200, 0, 'pitch').setOrigin(0, 0).setDepth(100);
    if (!scene.textures.exists('lightpool')) {
      const lp = scene.textures.createCanvas('lightpool', 320, 160)!, lc = lp.getContext();
      // an ellipse: a round gradient drawn with the y axis squashed, centred at (160, 80) of the picture and fading to nothing before its edges
      const rg = lc.createRadialGradient(160, 160, 4, 160, 160, 150); rg.addColorStop(0, 'rgba(255,243,176,0.30)'); rg.addColorStop(0.55, 'rgba(255,243,176,0.12)'); rg.addColorStop(1, 'rgba(255,243,176,0)');
      lc.save(); lc.scale(1, 0.5); lc.fillStyle = rg; lc.fillRect(0, 0, 320, 320); lc.restore(); lp.refresh();
    }
    this.pools = scene.add.container(0, 0).setDepth(3550);
    this.glow = scene.add.graphics().setDepth(3560).setScrollFactor(PAR).setBlendMode(Phaser.BlendModes.ADD);
    this.grade = scene.add.rectangle(0, 0, 10, 10, GRADE[this.time]).setOrigin(0, 0).setDepth(3500).setScrollFactor(0).setBlendMode(Phaser.BlendModes.MULTIPLY).setVisible(this.time !== 'day');
    const pk = `props_${id}`;
    if (scene.textures.exists(pk)) {       // the kit of the stadium: the mascot dancing at the side, torches at the corners and the statue
      this.mascot = scene.add.sprite(0, 0, pk, 0).setOrigin(0.5, 23 / 24).setDepth(3602);
      this.torches = [scene.add.sprite(0, 0, pk, 4).setOrigin(0.5, 23 / 24).setDepth(101), scene.add.sprite(0, 0, pk, 4).setOrigin(0.5, 23 / 24).setDepth(101).setFlipX(true)];
      this.statue = scene.add.sprite(0, 0, pk, 7).setOrigin(0.5, 23 / 24).setDepth(21);
    }
    this.bakeCrowd('idle', 0); this.setFrame('crowd_idle_0');
    if (this.mode === 'high') for (let k = 1; k < 4; k++) this.bakeCrowd('idle', k);
    this.drawVideo();
    // the other pictures of the crowd are made a moment later, while nobody is looking, so the first goal does not hitch
    if (this.mode === 'high') scene.time.delayedCall(400, () => { for (let k = 0; k < 4; k++) { this.bakeCrowd('cheer', k); this.bakeCrowd('stand', k); } this.bakeCrowd('waveup', 0); });
  }

  // ---------------------------------------------------------------- baking
  private bakeCrowd(state: 'idle' | 'cheer' | 'stand' | 'waveup', k: number): string {
    const key = `crowd_${state}_${k}`;
    if (this.baked.has(key) || this.scene.textures.exists(key)) { this.baked.add(key); return key; }
    const t = this.scene.textures.createCanvas(key, SW, BAND_H)!, c = t.getContext(); c.imageSmoothingEnabled = false;
    const th = this.theme, crest = -999;
    c.clearRect(0, 0, SW, BAND_H);
    for (let r = 0; r < ROWS; r++) {
      const y = r * ROW_H, dark = 0.72 + 0.28 * (r / (ROWS - 1));
      c.fillStyle = th.step; c.fillRect(0, y, SW, ROW_H);
      c.fillStyle = th.hi; c.fillRect(0, y + ROW_H - 2, SW, 1); c.fillStyle = th.lo; c.fillRect(0, y + ROW_H - 1, SW, 1);
      for (let col = AISLE - 1; col * SEAT < SW; col += AISLE) { c.fillStyle = th.lo; c.fillRect(col * SEAT, y, SEAT, ROW_H); c.fillStyle = th.rail; c.fillRect(col * SEAT, y, 1, ROW_H); c.fillRect(col * SEAT + SEAT - 1, y, 1, ROW_H); }
      for (const f of this.fans) if (f.row === r) drawFan(c, f, poseOf(f, state, k % 4, crest, f.col * SEAT), f.col * SEAT, y, dark);
      if (r % 3 === 2) { c.fillStyle = th.rail; c.fillRect(0, y + ROW_H - 1, SW, 1); }
    }
    t.refresh(); this.baked.add(key);
    return key;
  }

  /** The strip of an LED board: dark with letters of two pixels that change colour word by word. */
  private ledTexture(key: string, bright: number): string {
    if (this.scene.textures.exists(key)) return key;
    const txt = this.theme.led.repeat(2), w = Math.max(64, textWidth(txt, 2));
    const t = this.scene.textures.createCanvas(key, w, 16)!, c = t.getContext(); c.imageSmoothingEnabled = false;
    c.fillStyle = bright < 1 ? '#201638' : '#2A1B3D'; c.fillRect(0, 0, w, 16);
    let word = 0; const colours = this.theme.ledColors;
    const idx: number[] = []; [...txt].forEach((ch) => { idx.push(word); if (ch === ' ') word++; });
    drawText(c, txt, 0, 3, 2, (i) => { const col = colours[idx[i] % colours.length]; return bright < 1 ? col + 'bb' : col; });
    c.fillStyle = '#2A1B3D'; for (let x = 0; x < w; x += 4) c.fillRect(x, 0, 1, 16);     // the dots of the board
    c.fillStyle = '#FFFFFF'; c.fillRect(0, 0, w, 1);
    t.refresh();
    return key;
  }

  /** A simple backdrop made by code (mountains with a glow) until the AI art exists, and for the stadiums that have none yet. */
  private makeBackdrop(): void {
    const key = `bg_proc_${this.theme.name}`;
    if (!this.scene.textures.exists(key)) {
      const t = this.scene.textures.createCanvas(key, 400, 130)!, c = t.getContext();
      const sky = SKY[this.time]; const gr = c.createLinearGradient(0, 0, 0, 130); gr.addColorStop(0, sky[0]); gr.addColorStop(1, sky[3]); c.fillStyle = gr; c.fillRect(0, 0, 400, 130);
      c.fillStyle = this.time === 'night' ? '#2A1B3D' : '#6E5A8A';
      for (const [x, h, w] of [[40, 50, 90], [130, 74, 110], [230, 52, 80], [320, 66, 100]] as const) { c.beginPath(); c.moveTo(x - w / 2, 130); c.lineTo(x, 130 - h); c.lineTo(x + w / 2, 130); c.fill(); }
      c.fillStyle = '#FF8A2A'; c.fillRect(124, 130 - 74, 12, 3);
      t.refresh();
    }
    this.bgImg = this.scene.add.tileSprite(0, 0, 10, 10, key).setOrigin(0, 0).setDepth(5).setScrollFactor(0);
  }

  /** Every line of the pitch, at 1:1 pixels, from the constants of field.ts. World x starts at CAM_MIN_X - 200. */
  private bakePitch(): void {
    const ox = -(CAM_MIN_X - 200), w = CAM_MAX_X - CAM_MIN_X + 400, h = PITCH.d + 16;
    const t = this.scene.textures.createCanvas('pitch', w, h)!;
    const c = t.getContext(); c.imageSmoothingEnabled = false;
    const R = (col: string, x: number, y: number, rw = 1, rh = 1): void => { c.fillStyle = col; c.fillRect(ox + x, y, rw, rh); };
    R(PAL.ground, CAM_MIN_X - 200, 0, w, h);
    for (let x = 0; x < PITCH.w; x += 32) R(((x / 32) & 1) ? PAL.grass2 : PAL.grass1, x, 0, 32, PITCH.d);
    const L = PAL.line;
    R(L, 0, 0, PITCH.w, 1); R(L, 0, PITCH.d - 1, PITCH.w, 1); R(L, 0, 0, 1, PITCH.d); R(L, PITCH.w - 1, 0, 1, PITCH.d); R(L, PITCH.w / 2, 0, 1, PITCH.d);
    for (let a = 0; a < 360; a += 2) { const r = a * Math.PI / 180; R(L, Math.round(CENTER.x + Math.cos(r) * CENTER.r), Math.round(CENTER.y + Math.sin(r) * CENTER.r)); }
    R(L, CENTER.x - 1, CENTER.y - 1, 3, 3);
    for (const side of [0, 1]) {
      const x0 = side ? PITCH.w : 0;
      const box = (len: number, y0: number, y1: number): void => { R(L, side ? x0 - len : x0, y0, len, 1); R(L, side ? x0 - len : x0, y1, len, 1); R(L, side ? x0 - len : x0 + len - 1, y0, 1, y1 - y0 + 1); };
      box(AREA_BIG.len, AREA_BIG.y0, AREA_BIG.y1); box(AREA_SMALL.len, AREA_SMALL.y0, AREA_SMALL.y1);
      R(L, side ? PITCH.w - PENALTY_X : PENALTY_X, 80, 2, 2);
      const nx = side ? x0 : x0 - GOAL.net;
      R('#E6EEF5', nx, GOAL.y0 - GOAL.bar, GOAL.net, GOAL.y1 - GOAL.y0 + GOAL.bar);
      for (let y = GOAL.y0 - GOAL.bar; y <= GOAL.y1; y += 4) R('#BFD0E0', nx, y, GOAL.net, 1);
      for (let x = 0; x <= GOAL.net; x += 4) R('#BFD0E0', nx + x, GOAL.y0 - GOAL.bar, 1, GOAL.y1 - GOAL.y0 + GOAL.bar);
      R('#FFFFFF', x0 - 1, GOAL.y0 - GOAL.bar, 2, GOAL.y1 - GOAL.y0 + GOAL.bar + 1);
    }
    t.refresh();
  }

  private setFrame(key: string): void { if (key !== this.frameKey) { this.frameKey = key; this.crowdImg.setTexture(key); this.crowdImg.setCrop(0, BAND_H - this.rows * ROW_H, SW, this.rows * ROW_H); } }
  /** The window of the wave: the picture with every arm up, seen only through 140 px round the crest. */
  private setWave(crest: number): void {
    this.crest = crest;
    if (crest < -70 || crest > SW + 70) { this.waveImg.setVisible(false); return; }
    const x0 = Math.max(0, Math.round(crest - 70)), x1 = Math.min(SW, Math.round(crest + 70));
    this.waveImg.setTexture(this.bakeCrowd('waveup', 0)).setVisible(true).setCrop(x0, BAND_H - this.rows * ROW_H, Math.max(1, x1 - x0), this.rows * ROW_H);
  }

  // ---------------------------------------------------------------- layout
  /** Called when the screen size changes. */
  layout(w: number, h: number): void {
    this.W = w; this.H = h; this.top = pitchScreenTop(h);
    const above = this.top - 16;                                  // everything above the far boards
    const backdrop = Math.max(28, Math.round(above * 0.45));
    this.rows = Math.max(2, Math.min(ROWS, Math.floor((above - backdrop) / ROW_H)));
    const standsBottom = above, standsTop = standsBottom - this.rows * ROW_H;
    this.ground.setSize(w, h - above).setPosition(0, above);
    this.crowdImg.setPosition(BAND_X, standsBottom).setCrop(0, BAND_H - this.rows * ROW_H, SW, this.rows * ROW_H); this.frameKey = '';
    this.waveImg.setPosition(BAND_X, standsBottom);
    this.ledFar.setSize(w, 16).setPosition(0, above);
    this.ledNear.setSize(w, 16).setPosition(0, this.top + PITCH.d);
    this.pitch.setY(this.top);
    this.grade.setSize(w, h);
    // sky and its stars
    const s = this.sky; s.clear();
    const cols = SKY[this.time].map((c) => Phaser.Display.Color.HexStringToColor(c).color);
    const bands = cols.length, bh = Math.ceil(standsTop / bands);
    cols.forEach((c, i) => s.fillStyle(c, 1).fillRect(0, i * bh, w, bh));
    if (this.time === 'night') for (let i = 0; i < 46; i++) { const x = (i * 97) % w, y = (i * 53) % Math.max(4, standsTop - 4); s.fillStyle(i % 5 === 0 ? 0xffe45c : 0xffffff, 0.8).fillRect(x, y, 1 + (i % 7 === 0 ? 1 : 0), 1); }
    // the backdrop sits on the stands: its horizon (65% of its height) touches the top of the stands
    if (this.bgImg) {
      const tex = this.bgImg.texture.getSourceImage() as HTMLImageElement | HTMLCanvasElement, ih = tex.height, horizon = Math.round(ih * 0.86);   // the lowest 14% hides behind the stands
      this.bgImg.setSize(w, ih).setPosition(0, standsTop - horizon);
    }
    this.drawTowers(standsTop);
    // the hour washes the backdrop: a pale blue by day and a warm pink at sunset
    this.wash.clear();
    if (this.altArt) { /* painted for this hour: no wash */ }
    else if (this.time === 'day') this.wash.fillStyle(0xbfefff, 0.62).fillRect(0, 0, w, standsTop);
    else if (this.time === 'sunset') this.wash.fillStyle(0xff9e7a, 0.34).fillRect(0, 0, w, standsTop);
    if (this.mascot) this.mascot.setPosition(70, this.top + PITCH.d + 14);
    if (this.torches.length) { this.torches[0].setPosition(-30, this.top + 18); this.torches[1].setPosition(PITCH.w + 30, this.top + 18); }
    if (this.statue) this.statue.setPosition(-70, this.top + 6);
    this.video.setPosition(480, standsBottom - 3);
    this.pools.removeAll(true);
    if (this.time !== 'day') for (const x of [150, 390, 570, 810]) this.pools.add(this.scene.add.image(x, this.top + 80, 'lightpool').setBlendMode(Phaser.BlendModes.ADD).setAlpha(this.time === 'night' ? 1 : 0.6).setScale(1.5, 1.6));
  }

  private drawTowers(standsTop: number): void {
    const g = this.towers; g.clear();
    for (const x of [140, 400, 660, 900]) {
      g.fillStyle(0x4a3a5c, 1).fillRect(x - 2, standsTop - 20, 4, 24);
      g.fillStyle(0x2a1b3d, 1).fillRect(x - 12, standsTop - 30, 24, 10);
      for (let i = 0; i < 6; i++) g.fillStyle(Phaser.Display.Color.HexStringToColor(this.theme.lamp).color, 1).fillRect(x - 10 + (i % 3) * 7, standsTop - 29 + Math.floor(i / 3) * 4, 5, 3);
    }
  }

  /** The stands and the boards slide a little slower than the pitch (parallax), so the screen is always full. */
  scroll(camX: number): void {
    this.camX = camX;
    this.ledFar.tilePositionX = Math.round(camX * 0.9 + this.clock * 30);
    this.ledNear.tilePositionX = Math.round(camX * 1.1 + this.clock * 24);
    if (this.bgImg) this.bgImg.tilePositionX = Math.max(0, Math.round(camX * 0.2));
  }

  // ---------------------------------------------------------------- the live part
  /** The crowd reacts to a goal: they jump for 3 s, photos flash, fireworks go up and the video scoreboard shows the scorer. */
  goal(scorer: string, score: [number, number]): void {
    this.cheerT = 3.2; this.flashT = 2.4; this.nameT = 3.2; this.scorer = scorer; this.score = [...score] as [number, number];
    this.waveT = -1; this.nextWave = this.clock + 25;
    if (this.mode === 'high') for (let i = 0; i < (this.time === 'night' ? 4 : 2); i++) this.launch(i * 0.35);
    this.drawVideo();
  }
  /** A near miss, a save or a special: the fans stand up for a moment. */
  gasp(): void { this.standT = Math.max(this.standT, 1.0); }
  /** The wave runs along the stands (2.4 s). */
  wave(): void { if (this.mode === 'high' && this.waveT < 0 && this.cheerT <= 0) this.waveT = 0; }
  setScore(s: [number, number]): void { if (s[0] !== this.score[0] || s[1] !== this.score[1]) { this.score = [...s] as [number, number]; this.drawVideo(); } }

  private launch(delay: number): void {
    const camLeft = this.camX * PAR + BAND_X;
    this.rockets.push({ x: camLeft + 30 + Math.random() * (this.W - 60), y: 0, vy: -90 - Math.random() * 40, t: -delay, boom: 0.5 + Math.random() * 0.3, col: [[0xff5e7e, 0xffb23f, 0xffe45c], [0x7be3ff, 0xb98cff, 0xffffff], [0x5ddb43, 0xffe45c, 0xffffff]][Math.floor(Math.random() * 3)], burst: null });
  }

  /** `dtMs` is the real time of the frame. Moves the crowd, the flags, the lights and the little effects. */
  update(dtMs: number, fpsCap = 0): void {
    const dt = Math.min(0.1, dtMs / 1000);
    this.clock += dt;
    this.cheerT = Math.max(0, this.cheerT - dt); this.standT = Math.max(0, this.standT - dt); this.flashT = Math.max(0, this.flashT - dt); this.nameT = Math.max(0, this.nameT - dt);
    if (this.nameT === 0 && this.scorer) { this.scorer = ''; this.drawVideo(); }
    if (this.waveT >= 0) { this.waveT += dt; if (this.waveT >= 2.4) { this.waveT = -1; this.nextWave = this.clock + 40; } }
    else if (this.mode === 'high' && this.clock >= this.nextWave && this.cheerT <= 0) this.wave();
    // quality: a frame slower than 20 ms for 3 s drops the crowd to its light mode (fpsCap fakes slow frames for the tests)
    const real = fpsCap > 0 ? Math.max(dtMs, 1000 / fpsCap) : dtMs;
    this.slow += (real - this.slow) * 0.3;
    this.slowFor = this.slow > 20 ? this.slowFor + dt : 0;
    if (this.slowFor > 0 && this.slowStart < 0) this.slowStart = this.clock;
    if (this.slowFor === 0) this.slowStart = -1;
    if (this.auto && this.mode === 'high' && this.slowFor >= 3) { this.mode = 'low'; this.lowAt = this.clock; }
    // which picture of the crowd: the wave is a window over the calm one
    const k = this.mode === 'high' ? Math.floor(this.clock * 6) % 4 : 0;
    let state: Stadium['state'] = 'idle';
    if (this.cheerT > 0) state = 'cheer'; else if (this.waveT >= 0 && this.mode === 'high') state = 'wave'; else if (this.standT > 0) state = 'stand';
    let kk = k;
    if (this.mode === 'low') kk = state === 'cheer' ? Math.floor(this.clock * 3) % 2 : 0;
    this.state = state; this.frame = kk;
    this.setFrame(this.bakeCrowd(state === 'wave' ? 'idle' : state, kk));
    if (state === 'wave') this.setWave(-80 + (this.waveT / 2.4) * (SW + 160)); else { this.crest = -1; this.waveImg.setVisible(false); }
    this.drawLive(dt);
  }

  private drawLive(dt: number): void {
    const t = this.clock, standsBottom = this.top - 16, standsTop = standsBottom - this.rows * ROW_H;
    // flags and banners: cloth that waves, a column at a time
    const b = this.banners; b.clear();
    if (this.mode === 'high' || Math.floor(t * 2) % 2 === 0) for (const x0 of [60, 230, 380, 520, 700, 860]) {
      const hh = Math.min(26, this.rows * ROW_H - 4);
      for (let i = 0; i < 8; i++) {
        const dx = Math.round(Math.sin(t * 3 + i * 0.7 + x0) * (1 + i * 0.12));
        b.fillStyle(Phaser.Display.Color.HexStringToColor(this.theme.banner[i % 4 < 2 ? 0 : 1]).color, 1).fillRect(x0 + i + dx, standsTop + 2, 1, hh);
      }
      b.fillStyle(0xffffff, 1).fillRect(x0 + 2, standsTop + 8, 3, 4);
    }
    // the lights of the towers glow at night
    const g = this.glow; g.clear();
    if (this.time !== 'day') for (const x of [140, 400, 660, 900]) g.fillStyle(0xfff3b0, this.time === 'night' ? 0.22 : 0.12).fillCircle(x, standsTop - 25, 14 + (this.mode === 'high' ? Math.round(Math.sin(t * 5 + x) * 1) : 0));
    // the flashes of the photos in the stands
    const f = this.fx; f.clear();
    if (this.flashT > 0 && this.mode === 'high') {
      const camLeft = this.camX * PAR + BAND_X;
      for (let i = 0; i < 14; i++) {
        if (((Math.floor(t * 12) + i * 7) % 5) !== 0) continue;
        const x = camLeft + 8 + ((i * 53 + Math.floor(t * 12) * 31) % (this.W - 16)), y = standsTop + 4 + ((i * 29 + Math.floor(t * 12) * 17) % Math.max(4, this.rows * ROW_H - 8));
        f.fillStyle(0xffffff, 1).fillRect(Math.round(x), Math.round(y), 3, 2);
      }
    }
    // fireworks
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      r.t += dt;
      if (r.t < 0) continue;
      if (!r.burst) {
        r.y = standsTop - 4 + r.vy * r.t; f.fillStyle(0xffe45c, 1).fillRect(Math.round(r.x), Math.round(r.y), 2, 3);
        if (r.t >= r.boom) { r.burst = []; for (let j = 0; j < 28; j++) { const a = (j / 28) * Math.PI * 2, s = 40 + Math.random() * 30; r.burst.push({ x: r.x, y: r.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1.1, c: r.col[j % r.col.length] }); } }
      } else {
        let alive = 0;
        for (const p of r.burst) { p.life -= dt; p.vy += 60 * dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.life > 0) { alive++; f.fillStyle(p.c, Math.min(1, p.life * 1.5)).fillRect(Math.round(p.x), Math.round(p.y), 2, 2); } }
        if (!alive) this.rockets.splice(i, 1);
      }
    }
    // the mascot dances (faster and higher after a goal) and the torches flicker
    if (this.mascot) {
      const fast = this.cheerT > 0;
      this.mascot.setFrame(Math.floor(t * (fast ? 8 : 4)) % 4).setY(this.top + PITCH.d + 14 - (fast ? Math.abs(Math.round(Math.sin(t * 10) * 3)) : 0));
    }
    for (const tc of this.torches) tc.setAlpha(this.mode === 'high' ? 0.92 + 0.08 * Math.sin(t * 17 + tc.x) : 1);
    void standsBottom;
  }

  /** The video scoreboard: the score and, for a few seconds after a goal, the name of the scorer. */
  private drawVideo(): void {
    const c = this.vcanvas.getContext(); c.imageSmoothingEnabled = false;
    c.clearRect(0, 0, 72, 26);
    c.fillStyle = '#2A1B3D'; c.fillRect(0, 0, 72, 26); c.fillStyle = '#4A3560'; c.fillRect(1, 1, 70, 24); c.fillStyle = '#10081E'; c.fillRect(3, 3, 66, 20);
    drawText(c, 'FAM', 6, 5, 1, () => '#5DDB43'); drawText(c, ABBR[this.rivalKind()], 48, 5, 1, () => COLOR[this.rivalKind()]);
    if (this.scorer) { const w = textWidth(this.scorer, 1); drawText(c, this.scorer, Math.round((72 - w) / 2), 15, 1, (i) => (Math.floor(this.clock * 6) + i) % 2 ? '#FFE45C' : '#FFFFFF'); }
    else drawText(c, `${this.score[0]}-${this.score[1]}`, Math.round((72 - textWidth(`${this.score[0]}-${this.score[1]}`, 2) + 2) / 2), 11, 2, () => '#FFE45C');
    this.vcanvas.refresh();
  }

  // ---------------------------------------------------------------- what the tests ask
  /** Fans whose seat is on the screen now (their world x moves at 0.8 of the camera). */
  visibleFans(): Fan[] {
    return this.fans.filter((f) => { const sx = BAND_X + f.col * SEAT - this.camX * PAR; return f.row >= ROWS - this.rows && sx >= 0 && sx < this.W; });
  }
  /** Pose of a fan in the picture on the screen right now. */
  poseNow(f: Fan): FanPose { return poseOf(f, this.state, this.frame % 4, this.crest, f.col * SEAT); }
  /** Share of the visible fans that are jumping or have their arms up. */
  cheeringShare(): number { const v = this.visibleFans(); return v.length ? v.filter((f) => { const p = this.poseNow(f); return p === 'up' || p === 'jump'; }).length / v.length : 0; }
  /** x of the crest of the wave on the stand texture, or -1 when there is none. */
  crestX(): number { return this.state === 'wave' ? this.crest : -1; }
  get sizeInfo(): { rows: number; fans: number } { return { rows: this.rows, fans: this.fans.length }; }
}
