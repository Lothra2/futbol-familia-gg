# iPhone, iPad y tablets Android: qué se revisó y qué probar
Nunca se ha jugado en un aparato real. Todo lo táctil se probó **simulado** con Chromium (viewport de teléfono, `hasTouch`, eventos táctiles por CDP).

## Revisado en el código
| Tema | Estado |
|---|---|
| Meta de pantalla completa para iOS (`apple-mobile-web-app-capable`, `viewport-fit=cover`, iconos, manifest) | revisado en `index.html` |
| El audio arranca con el primer toque (`pointerdown`, `touchend`, `keydown`) y usa `webkitAudioContext` si hace falta | revisado, `tests/e2e/audio.mjs` en Chromium |
| iPhone no tiene API de pantalla completa: sale una tarjeta con los pasos (Compartir, Añadir a pantalla de inicio) | revisado en `src/app/fullscreen.ts` |
| Zoom por doble toque y pellizco bloqueados, `touch-action: none` en el campo | revisado |
| Escala entera del lienzo con la densidad de pantalla (iPhone 3x, iPad 2x) | probado con `computeLayout` |
| Guardado: si Safari bloquea `localStorage` (modo privado) el juego sigue con memoria | probado en `tests/unit/save.test.ts` |
| Menús caben y se tocan en 667x375, 844x390, 926x428, 1024x768, 1180x820, 1280x720 y 1366x1024 | probado en `tests/e2e/menu.mjs` |
| Pausa al perder el foco, cambiar de pestaña o girar a vertical | probado |
| Narrador: voz del navegador, arranca después de un toque | simulado (hay un `speechSynthesis` falso en `tests/e2e/narrator.mjs`) |

## Límites conocidos de iOS (no son fallos del juego)
- **Interruptor de silencio:** con el timbre en silencio, Safari no deja sonar el audio web. Hay que subirlo.
- **Pantalla completa:** solo existe si se instala en la pantalla de inicio.
- **Voces:** el narrador usa las voces en español que tenga el aparato. Si no hay, se queda mudo.
- **Rendimiento:** el estadio baja solo a calidad baja si los cuadros tardan más de 20 ms durante 3 s.

## Lista de 10 minutos para probar en un aparato real
1. Abre el enlace, toca la portada: ¿suena la música? (con el timbre activado)
2. Menú: ¿se ven los 5 botones y el de Desafíos sin cortarse?
3. Partido rápido, controles fáciles: ¿el joystick sigue al dedo y el botón ¡Patea! responde?
4. Controles completos: Tiro, Pase, Correr y Especial a la vez con dos dedos.
5. Marca un gol: ¿se ve la cinemática y la repetición?, ¿un toque las salta?
6. Dos jugadores en la misma pantalla: ¿cada mitad responde sola?
7. Gira a vertical: ¿pausa y pide girar?
8. Cierra y abre otra vez: ¿se guardó el nivel?
9. Anota cualquier cosa lenta, cortada o que no se pueda tocar, con el modelo del aparato.
