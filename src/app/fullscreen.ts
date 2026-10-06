/** Full screen on every device that allows it, and clear instructions on the ones that do not (iPhone Safari has no full screen API). */
const doc = document as Document & { webkitFullscreenElement?: Element; webkitFullscreenEnabled?: boolean; webkitExitFullscreen?: () => Promise<void> };
const root = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };

export const isIOS = (): boolean => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isPhoneLike = (): boolean => matchMedia('(pointer: coarse)').matches;
/** Opened from the home screen (installed): it already has no browser bars. */
export const isInstalled = (): boolean => !!(navigator as Navigator & { standalone?: boolean }).standalone || matchMedia('(display-mode: fullscreen)').matches || matchMedia('(display-mode: standalone)').matches;
export const apiAvailable = (): boolean => !!(root.requestFullscreen || root.webkitRequestFullscreen) && (doc.fullscreenEnabled ?? doc.webkitFullscreenEnabled ?? true);
export const isFull = (): boolean => !!(doc.fullscreenElement || doc.webkitFullscreenElement) || isInstalled();

export async function enterFullscreen(): Promise<boolean> {
  if (!apiAvailable()) return false;
  try {
    if (root.requestFullscreen) await root.requestFullscreen({ navigationUI: 'hide' }); else await root.webkitRequestFullscreen!();
    try { await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape'); } catch { /* not every browser allows it */ }
    return true;
  } catch { return false; }
}

export async function exitFullscreen(): Promise<void> {
  try { if (doc.exitFullscreen) await doc.exitFullscreen(); else await doc.webkitExitFullscreen?.(); } catch { /* ignore */ }
}

/** Button handler: real full screen where possible, otherwise the steps for this device. */
export async function onFullscreenButton(): Promise<void> {
  if (isFull() && !isInstalled()) { await exitFullscreen(); return; }
  if (await enterFullscreen()) return;
  showHelp();
}

export function showHelp(): void {
  if (document.getElementById('fs-help')) return;
  const ios = isIOS();
  const steps = ios
    ? `<li>Toca el botón <b>Compartir</b> (el cuadrado con la flecha hacia arriba) de Safari.</li><li>Elige <b>Añadir a pantalla de inicio</b>.</li><li>Abre el juego desde ese icono nuevo: se ve sin barras y a pantalla completa.</li>`
    : `<li>Abre el menú del navegador (los tres puntos).</li><li>Elige <b>Instalar app</b> o <b>Añadir a pantalla de inicio</b>.</li><li>Abre el juego desde el icono nuevo: se ve sin barras.</li>`;
  const box = document.createElement('div');
  box.id = 'fs-help';
  box.innerHTML = `<div class="fs-card"><h2>Pantalla completa</h2><p>${ios ? 'El iPhone no deja poner un sitio web en pantalla completa desde el botón. Se hace así, una sola vez:' : 'Este navegador no permite pantalla completa desde el botón. Se puede así:'}</p><ol>${steps}</ol><p class="fs-note">Con el teléfono acostado se ve mejor.</p><button class="btn big primary" id="fs-close">Entendido</button></div>`;
  document.body.appendChild(box);
  box.querySelector('#fs-close')!.addEventListener('click', () => box.remove());
}

/** Keeps a class on <body> so the buttons hide themselves when the page is already full screen. */
export function watchFullscreen(): void {
  const sync = () => document.body.classList.toggle('is-full', isFull());
  document.addEventListener('fullscreenchange', sync); document.addEventListener('webkitfullscreenchange', sync);
  sync();
}

/** Pinch zoom on iOS ignores touch-action, so it is stopped here. */
export function blockZoomGestures(): void {
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault());
}
