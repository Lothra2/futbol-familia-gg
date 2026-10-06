import { describe, expect, it } from 'vitest';
import { InputRouter } from '../../src/input/router';

describe('router de entrada', () => {
  it('un toque mas corto que un paso no se pierde (el cerrojo vive hasta endStep)', () => {
    const r = new InputRouter();
    r.setButton(0, 'touch', 'shoot', true); r.setButton(0, 'touch', 'shoot', false);
    expect(r.frame(0).shootPressed).toBe(true);
    expect(r.frame(0).shoot).toBe(false);
    r.endStep();
    expect(r.frame(0).shootPressed).toBe(false);
  });
  it('los botones sostenidos son el OR de todas las fuentes y se sueltan por fuente', () => {
    const r = new InputRouter();
    r.setButton(0, 'kb', 'sprint', true); r.setButton(0, 'pad0', 'sprint', true);
    r.setButton(0, 'kb', 'sprint', false);
    expect(r.frame(0).sprint).toBe(true);
    r.setButton(0, 'pad0', 'sprint', false);
    expect(r.frame(0).sprint).toBe(false);
  });
  it('el eje de mayor magnitud gana y cada jugador tiene el suyo', () => {
    const r = new InputRouter();
    r.setAxis(0, 'kb', 1, 0); r.setAxis(0, 'touch', 0, 0.4); r.setAxis(1, 'kb', -1, 0);
    expect(r.frame(0)).toMatchObject({ mx: 1, my: 0 });
    expect(r.frame(1).mx).toBe(-1);
  });
  it('releaseAll suelta todo (pausa, perder el foco)', () => {
    const r = new InputRouter();
    r.setAxis(0, 'kb', 1, 1); r.setButton(0, 'kb', 'special', true);
    r.releaseAll();
    expect(r.frame(0)).toMatchObject({ mx: 0, my: 0, special: false, specialPressed: false });
  });
  it('un boton que no se solto no vuelve a cerrojar mientras sigue pulsado', () => {
    const r = new InputRouter();
    r.setButton(0, 'kb', 'pass', true); r.endStep();
    r.setButton(0, 'kb', 'pass', true);
    expect(r.frame(0).passPressed).toBe(false);
    expect(r.frame(0).pass).toBe(true);
  });
});
