/**
 * Cuando se publica una versión nueva de la web, quien tenía la página abierta
 * sigue con el índice viejo y, al abrir una pantalla cargada con lazy(), pide un
 * trozo que ya no existe en Vercel. Eso cae en el ErrorBoundary («Algo ha ido
 * mal») y «Reintentar» no lo arregla: hace falta recargar. Lo hacemos solos,
 * una vez por minuto como mucho para no entrar en bucle si el fallo es otro.
 */
const CLAVE = 'fiestea:recarga-version';

const PATRON = /dynamically imported module|Importing a module script failed|error loading dynamically|ChunkLoadError|Loading (CSS )?chunk|Unable to preload CSS/i;

export const isStaleBuildError = (error: unknown): boolean =>
  PATRON.test(error instanceof Error ? `${error.name} ${error.message}` : String(error ?? ''));

/** Recarga la página si no se ha recargado por lo mismo en el último minuto. */
export function reloadForNewBuild(): boolean {
  try {
    const ultima = Number(sessionStorage.getItem(CLAVE) ?? 0);
    if (Date.now() - ultima < 60_000) return false;
    sessionStorage.setItem(CLAVE, String(Date.now()));
  } catch {
    // Sin sessionStorage no podemos evitar el bucle: mejor no recargar.
    return false;
  }
  window.location.reload();
  return true;
}

/** Vite avisa con este evento cuando falla la precarga de un trozo. */
export function setupStaleBuildReload(): void {
  window.addEventListener('vite:preloadError', (event) => {
    if (reloadForNewBuild()) event.preventDefault();
  });
}
