import { describe, expect, it } from 'vitest';
import { CHAIN, PoseSmoother, isLoop, logicalPose, resolvePose, sequenceFrame, type Atlas, type Logical } from '../../src/view/poses';
import { newCam, cameraTarget, shakeCamera, updateCamera } from '../../src/core/camera';
import { CAM_MAX_X, CAM_MIN_X } from '../../src/core/field';
import { fam, mk, rival, put, ball, secs, give, inp } from './helpers';
import { step } from '../../src/core/match';
import { startSlide } from '../../src/core/actions';
import { readFileSync } from 'node:fs';

const load = (id: string, dir = 'public/assets/sprites'): Atlas => JSON.parse(readFileSync(`${dir}/${id}.json`, 'utf8')).anims;

describe('poses', () => {
  it('cada pose lógica se resuelve en una animación que existe en el atlas de cada personaje', () => {
    for (const id of ['sophie', 'alana', 'papa', 'mama', 'juandi', 'thor', 'riv_dragon', 'riv_dragon_gk']) {
      const a = load(id);
      for (const l of Object.keys(CHAIN) as Logical[]) expect(a[resolvePose(a, l)], `${id} ${l}`).toBeDefined();
    }
  });
  it('usa la animación nueva de fútbol cuando existe y la de la Copa mientras no', () => {
    const copa = load('sophie', 'assets/sprites');
    expect(resolvePose(copa, 'shot')).toBe('throw'); expect(resolvePose(copa, 'slide')).toBe('land'); expect(resolvePose(copa, 'special')).toBe('power');
    expect(resolvePose({ ...copa, shot: { start: 56, frames: 3, fps: 0, loop: false } }, 'shot')).toBe('shot');
    expect(resolvePose(load('thor', 'assets/sprites'), 'shot')).toBe('headpush');
  });
  it('cada personaje celebra con su baile y pierde con su pose; Thor sigue con la suya', () => {
    for (const c of ['sophie', 'alana', 'papa', 'mama', 'juandi']) {
      const a = load(c);
      expect(resolvePose(a, 'celebrate'), c).toBe('dance'); expect(resolvePose(a, 'sad'), c).toBe('lose');
      expect(a.dance.frames).toBe(4); expect(a.dance.loop).toBe(true); expect(a.win.frames).toBe(1); expect(a.laugh.frames).toBe(1);
    }
    const t = load('thor');
    expect(resolvePose(t, 'celebrate')).toBe('celebrate_tailchase'); expect(resolvePose(t, 'sad')).toBe('sad');
  });
  it('el estado del núcleo se traduce a la pose correcta', () => {
    const m = mk({}, true); const p = fam(m, 'sophie'), t = fam(m, 'thor');
    p.state = 'idle'; expect(logicalPose(p)).toBe('idle');
    p.vx = 90; p.state = 'run'; expect(logicalPose(p)).toBe('run'); p.state = 'sprint'; expect(logicalPose(p)).toBe('run');
    for (const [s, l] of [['slide', 'slide'], ['tumble', 'tumble'], ['stagger', 'stagger'], ['dizzy', 'dizzy'], ['celebrate', 'celebrate'], ['sad', 'sad'], ['special', 'special'], ['hold', 'hold'], ['dive', 'dive'], ['bump', 'bump'], ['getup', 'getup']] as const) { p.state = s; expect(logicalPose(p)).toBe(l); }
    t.vx = 0; t.vy = 0; t.state = 'idle'; expect(logicalPose(t)).toBe('gkIdle');
    p.state = 'kick'; p.act = { kind: 'kick', t: 0, dur: 1, sub: 'chilena' }; expect(logicalPose(p)).toBe('chilena');
    p.act = { kind: 'kick', t: 0, dur: 1, sub: 'pass' }; expect(logicalPose(p)).toBe('pass');
  });
  it('la patada muestra la preparación, el contacto y el seguimiento, cada pose al menos 70 ms', () => {
    const a = load('sophie').throw; const p = { act: { contact: 0.12 } } as never;
    const frames: number[] = []; for (let t = 0; t < 0.4; t += 1 / 60) frames.push(sequenceFrame(a, 'shot', t, p));
    expect(frames[0]).toBe(0); expect(Math.max(...frames)).toBe(2);
    const runs: number[] = []; let n = 1; for (let i = 1; i < frames.length; i++) { if (frames[i] === frames[i - 1]) n++; else { runs.push(n); n = 1; } }
    for (const r of runs) expect((r / 60) * 1000).toBeGreaterThanOrEqual(70);
  });
  it('las secuencias de caída avanzan sin saltarse cuadros ni retroceder', () => {
    const a = load('sophie').tumble; const p = { act: { dur: 0.7 } } as never;
    let last = -1; for (let t = 0; t < 0.7; t += 1 / 60) { const f = sequenceFrame(a, 'tumble', t, p); expect(f).toBeGreaterThanOrEqual(last); expect(f - last).toBeLessThanOrEqual(1); last = f; }
    expect(last).toBe(a.frames - 1);
  });
  it('un cambio de pose dura al menos 70 ms y el paso a la pose de pie se retrasa 100 ms', () => {
    const s = new PoseSmoother(); s.logical = 'run';
    let t = 0, switched = -1; for (let i = 0; i < 30 && switched < 0; i++) { t += 1 / 60; if (s.update('idle', 1 / 60) === 'idle') switched = t; }
    expect(switched).toBeGreaterThanOrEqual(0.1 - 1 / 60);
    // a flicker of 1 frame to idle in the middle of a run never shows
    const r = new PoseSmoother(); r.logical = 'run'; const seen = new Set<string>();
    for (let i = 0; i < 120; i++) seen.add(r.update(i === 40 ? 'idle' : 'run', 1 / 60));
    expect(seen.has('idle')).toBe(false);
    // a short action is held for 70 ms even if the wanted pose changes at once
    const k = new PoseSmoother(); for (let i = 0; i < 10 && k.logical !== 'shot'; i++) k.update('shot', 1 / 60);
    expect(k.logical).toBe('shot');
    let held = 0; while (k.update('run', 1 / 60) === 'shot' && held < 30) held++;
    expect((held + 1) / 60).toBeGreaterThanOrEqual(0.07 - 1 / 60);
  });
  it('los bucles son idle, correr, celebrar y mareado; el resto son secuencias', () => {
    expect((Object.keys(CHAIN) as Logical[]).filter(isLoop).sort()).toEqual(['celebrate', 'dizzy', 'gkIdle', 'idle', 'run']);
  });
  it('la barrida y el golpe de una partida real producen poses válidas durante todo el partido', () => {
    const m = mk({}, true); const p = fam(m, 'sophie'), a = load('sophie');
    put(p, 400, 80); ball(m, 100, 20, 0, 0, 0, 0);
    p.input = inp({ shootPressed: true, mx: 1 }); step(m); p.input = inp();
    for (let i = 0; i < 90; i++) { const l = logicalPose(p), anim = a[resolvePose(a, l)]; const f = isLoop(l) ? 0 : sequenceFrame(anim, l, p.stateT, p); expect(f).toBeLessThan(anim.frames); step(m); }
    void startSlide; void rival; void give; void secs;
  });
});

describe('cámara', () => {
  it('sigue al balón sin salirse nunca de los límites (en cualquier ancho de pantalla)', () => {
    for (const w of [426, 512, 633, 640]) {
      const m = mk(); const c = newCam(); updateCamera(c, m, w, 1 / 60, true);
      for (let i = 0; i < 400; i++) { ball(m, ((i * 97) % 1000) - 20, 80, 0, (i % 2 ? 1 : -1) * 500, 0, 0); updateCamera(c, m, w, 1 / 60); expect(c.x).toBeGreaterThanOrEqual(CAM_MIN_X); expect(c.x).toBeLessThanOrEqual(CAM_MAX_X - w); }
    }
  });
  it('el primer cuadro salta al objetivo y después suaviza', () => {
    const m = mk(); ball(m, 800, 80, 0, 0, 0, 0); const c = newCam(); updateCamera(c, m, 480, 1 / 60, true);
    expect(c.x).toBe(cameraTarget(m, 480));
    ball(m, 200, 80, 0, 0, 0, 0); updateCamera(c, m, 480, 1 / 60);
    expect(c.x).toBeGreaterThan(cameraTarget(m, 480)); expect(c.x).toBeLessThan(560);
  });
  it('se adelanta hacia donde va el balón y un poco más si lo lleva un humano', () => {
    const m = mk(); ball(m, 480, 80, 0, 300, 0, 0); const slow = cameraTarget(m, 480); ball(m, 480, 80, 0, 0, 0, 0);
    expect(slow).toBeGreaterThan(cameraTarget(m, 480));
    const p = fam(m, 'sophie'); p.control = 'human'; give(m, p); ball(m, 480, 80, 0, 0, 0, 0); m.ball.owner = p.id; m.ball.state = 'owned';
    expect(cameraTarget(m, 480)).toBeGreaterThan(480 - 240 + 30);
  });
  it('la sacudida se apaga sola', () => {
    const c = newCam(); shakeCamera(c, 0.2); const m = mk();
    for (let i = 0; i < 20; i++) updateCamera(c, m, 480, 1 / 60);
    expect(c.shake).toBe(0);
  });
});
