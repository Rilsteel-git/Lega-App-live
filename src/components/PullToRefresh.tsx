/* ============================================================
   PullToRefresh.tsx — tarik layar ke bawah dari paling atas
   untuk memperbarui data. Browser's own pull-to-refresh is off
   (overscroll-behavior-y: none in mobile-shell.css) and an
   installed PWA has no reload button, so the app provides one.
   It refreshes the data and checks for a new app version; it
   does not reload the page.
   ============================================================ */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { t } from '../i18n';

/** Finger travel is halved so the indicator trails the finger. */
const RESISTANCE = 0.5;
/** Indicator travel needed to trigger a refresh. */
const THRESHOLD = 64;
const MAX_PULL = 96;
/** Keep the spinner up at least this long so a fast refresh doesn't flash. */
const MIN_SPIN_MS = 600;

/** True when the touch started inside something that scrolls on its own and
 *  isn't at its top, or inside an open modal. */
function startsInScrolledArea(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  if (target.closest('.modal-backdrop.open, [role="dialog"]')) return true;
  for (let node: Element | null = target; node && node !== document.body; node = node.parentElement) {
    if (node.scrollTop > 0) return true;
  }
  return false;
}

export function PullToRefresh({ onRefresh }: { onRefresh: () => Promise<unknown> }) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const refreshingRef = useRef(false);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    let start: { x: number; y: number } | null = null;
    let distance = 0;

    const reset = () => { start = null; distance = 0; setPull(0); };

    const onTouchStart = (event: TouchEvent) => {
      if (refreshingRef.current || event.touches.length !== 1) return;
      // A page with the body locked (modal, loader) or scrolled down can't pull.
      if (window.scrollY > 0 || document.body.style.overflow === 'hidden') return;
      if (startsInScrolledArea(event.target)) return;
      const touch = event.touches[0];
      start = { x: touch.clientX, y: touch.clientY };
      distance = 0;
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!start) return;
      // Another gesture (e.g. dragging a row to reorder) took this touch.
      if (event.defaultPrevented || window.scrollY > 0) { reset(); return; }
      const touch = event.touches[0];
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      if (dy <= 0 || (distance === 0 && Math.abs(dx) > dy)) { reset(); return; }
      distance = Math.min(dy * RESISTANCE, MAX_PULL);
      setPull(distance);
    };

    const onTouchEnd = () => {
      if (!start) return;
      const triggered = distance >= THRESHOLD;
      reset();
      if (!triggered) return;
      refreshingRef.current = true;
      setRefreshing(true);
      const minimum = new Promise((resolve) => window.setTimeout(resolve, MIN_SPIN_MS));
      void Promise.allSettled([onRefreshRef.current(), minimum]).then(() => {
        refreshingRef.current = false;
        setRefreshing(false);
      });
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd);
    window.addEventListener('touchcancel', reset);
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', reset);
    };
  }, []);

  if (!pull && !refreshing) return null;
  const offset = refreshing ? THRESHOLD : pull;
  const progress = Math.min(pull / THRESHOLD, 1);
  return createPortal(
    <div
      className={`pull-refresh${refreshing ? ' refreshing' : ''}${progress >= 1 ? ' ready' : ''}`}
      style={{ transform: `translate(-50%, ${offset}px)` }}
      role="status"
      aria-live="polite"
      aria-label={refreshing ? t('Refreshing') : progress >= 1 ? t('Release to refresh') : t('Pull to refresh')}
    >
      {/* A plain ring: it fills as you pull, then spins while refreshing. */}
      <svg className="pull-refresh-ring" viewBox="0 0 24 24" aria-hidden="true">
        <circle
          cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
          pathLength={100}
          strokeDasharray={refreshing ? '70 100' : `${Math.max(progress * 80, 4)} 100`}
          style={{ opacity: refreshing ? 1 : 0.35 + progress * 0.65 }}
        />
      </svg>
    </div>,
    document.body
  );
}
