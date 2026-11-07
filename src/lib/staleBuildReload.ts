/* After a new deploy, a page started from the previous build (often served by
 * the old service worker) can still try to load a lazy page chunk whose hashed
 * file no longer exists. The import then fails and React unmounts the whole
 * tree, which leaves a blank screen. Reloading once picks up the new build. */

const RELOAD_KEY = 'lega-stale-build-reload-at';
/** Don't reload again within this window, so a real outage can't loop. */
const RELOAD_COOLDOWN_MS = 30_000;

export function isChunkLoadError(error: unknown) {
  const message = error instanceof Error ? `${error.name} ${error.message}` : String(error ?? '');
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported|ChunkLoadError|Loading chunk|Unable to preload CSS/i.test(message);
}

/** Reloads the page unless it already did so very recently. */
export function reloadForStaleBuild() {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
    if (Date.now() - last < RELOAD_COOLDOWN_MS) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // Without storage we can't guard against a loop, so let the fallback UI show.
    return false;
  }
  window.location.reload();
  return true;
}

export function installStaleBuildReload() {
  // Vite fires this when a preload for a lazy chunk fails.
  window.addEventListener('vite:preloadError', (event) => {
    if (reloadForStaleBuild()) event.preventDefault();
  });
  window.addEventListener('unhandledrejection', (event) => {
    if (isChunkLoadError(event.reason)) reloadForStaleBuild();
  });
}
