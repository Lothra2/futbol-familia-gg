# Licencias y origen
- **Código del juego:** propio del proyecto. Reutiliza piezas del juego anterior de la familia (La Copa del Bosque Arcoíris).
- **Phaser 4** (MIT). **Vite, TypeScript, Vitest, Playwright** (MIT o Apache 2.0), solo en desarrollo.
- **Pixelify Sans:** licencia SIL OFL 1.1 (`public/assets/fonts/OFL.txt`).
- **Arte:** generado con Higgsfield (`xai/grok-imagine-image-2.0`) a partir de las fotos y dibujos de la familia, y procesado a 16 bits con las herramientas de `tools/`. Cada generación está en `art-src/generations.jsonl` y `docs/GENERATIONS.md`.
- **Jugadores en la cancha (`public/assets/nes`):** los atletas del Nekketsu Olympic GG (`Lothra2/Nekketsu-Olympic-GG`), armados con PixelForja (`Lothra2/pixel_forja`) con piezas del Universal LPC Spritesheet Character Generator (Liberated Pixel Cup). Licencias CC-BY-SA 3.0, GPL 3.0, OGA-BY 3.0, CC-BY 3.0 y CC0, pieza por pieza y con sus autores en `public/assets/nes/CREDITOS.txt`. Las hojas derivadas se comparten con las mismas licencias. Se arman con `tools/nes/olimpico.py`.
- **Música y efectos:** sintetizados en el navegador por `src/audio`. No hay archivos de audio ni muestras externas.
