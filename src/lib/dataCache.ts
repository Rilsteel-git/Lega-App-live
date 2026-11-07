/* ============================================================
   dataCache.ts — the last data loaded for a user, kept in
   localStorage so the app can show it immediately on the next
   start while fresh data loads in the background.
   ============================================================ */

import type { AppData } from './db';

const PREFIX = 'lega-app-data:';
/** Bump when AppData's shape changes so old caches are ignored. */
const VERSION = 1;

interface CacheEntry {
  version: number;
  savedAt: number;
  data: AppData;
}

export function readCachedData(userId: string): AppData | null {
  try {
    const raw = localStorage.getItem(PREFIX + userId);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry;
    return entry.version === VERSION ? entry.data : null;
  } catch {
    return null;
  }
}

export function writeCachedData(userId: string, data: AppData) {
  const entry: CacheEntry = { version: VERSION, savedAt: Date.now(), data };
  try {
    localStorage.setItem(PREFIX + userId, JSON.stringify(entry));
  } catch {
    // Storage full or disabled: the app still works, it just loads from the
    // network on the next start. Drop a stale copy so it isn't shown later.
    try { localStorage.removeItem(PREFIX + userId); } catch { /* ignore */ }
  }
}

/** Removes every user's cached data — called when signing out. */
export function clearCachedData() {
  try {
    for (let index = localStorage.length - 1; index >= 0; index--) {
      const key = localStorage.key(index);
      if (key?.startsWith(PREFIX)) localStorage.removeItem(key);
    }
  } catch {
    // Storage disabled: nothing was cached.
  }
}
