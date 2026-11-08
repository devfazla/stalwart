'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

// A thin loading bar pinned to the very top of the viewport, the way a browser
// shows its own page-load progress. Route switches (Mail, Calendar, Contacts,
// Files, Settings) and admin page switches both fetch or re-render with a gap
// where nothing used to move; this fills that gap so the app feels responsive.
//
// Three signals start it: a capture-phase click on an internal same-origin
// anchor (fires before Next begins the RSC fetch, so the bar is up during the
// wait), a popstate (back/forward), and a patched history.pushState/replaceState
// (covers navigateAdmin's route-less page switches and any router.push/replace).
// It finishes once the new pathname paints, with a minimum on-screen time so an
// instant switch still registers. Decorative: aria-hidden, the document title
// already tells screen readers where they landed.

const MIN_VISIBLE_MS = 300;
const TRICKLE_MS = 200;
const COMPLETE_MS = 220;
const FADE_MS = 240;
const SAFETY_MS = 8000;

function urlKey(): string {
  return `${window.location.pathname}${window.location.search}`;
}

function reducedMotion(): boolean {
  const attr = document.documentElement.getAttribute('data-motion');
  if (attr === 'reduce') return true;
  if (attr === 'full') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function NavigationProgress() {
  const pathname = usePathname();
  const [width, setWidth] = useState(0);
  const [visible, setVisible] = useState(false);

  const activeRef = useRef(false);
  const finishingRef = useRef(false);
  const startedAtRef = useRef(0);
  const lastKeyRef = useRef('');
  const firstPathRef = useRef(true);
  const trickleRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const safetyRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completeRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number[]>([]);

  const clearTimers = useCallback(() => {
    if (trickleRef.current) clearInterval(trickleRef.current);
    if (safetyRef.current) clearTimeout(safetyRef.current);
    if (completeRef.current) clearTimeout(completeRef.current);
    if (hideRef.current) clearTimeout(hideRef.current);
    trickleRef.current = null;
    safetyRef.current = null;
    completeRef.current = null;
    hideRef.current = null;
    for (const id of rafRef.current) cancelAnimationFrame(id);
    rafRef.current = [];
  }, []);

  const finish = useCallback(() => {
    if (!activeRef.current || finishingRef.current) return;
    finishingRef.current = true;
    if (trickleRef.current) clearInterval(trickleRef.current);
    if (safetyRef.current) clearTimeout(safetyRef.current);
    trickleRef.current = null;
    safetyRef.current = null;
    const elapsed = performance.now() - startedAtRef.current;
    const wait = Math.max(0, MIN_VISIBLE_MS - elapsed);
    completeRef.current = setTimeout(() => {
      setWidth(100);
      hideRef.current = setTimeout(() => {
        setVisible(false);
        activeRef.current = false;
        finishingRef.current = false;
        setWidth(0);
      }, FADE_MS);
    }, wait);
  }, []);

  const start = useCallback(() => {
    clearTimers();
    activeRef.current = true;
    finishingRef.current = false;
    startedAtRef.current = performance.now();
    setVisible(true);
    setWidth(8);
    if (!reducedMotion()) {
      trickleRef.current = setInterval(() => {
        setWidth((w) => {
          if (w >= 90) return w;
          const inc = w < 20 ? 6 : w < 50 ? 3 : w < 80 ? 1.5 : 0.5;
          return Math.min(90, w + inc);
        });
      }, TRICKLE_MS);
    } else {
      setWidth(40);
    }
    safetyRef.current = setTimeout(finish, SAFETY_MS);
  }, [clearTimers, finish]);

  const ensureStarted = useCallback(() => {
    if (!activeRef.current) start();
  }, [start]);

  const finishAfterPaint = useCallback(() => {
    const first = requestAnimationFrame(() => {
      const second = requestAnimationFrame(() => finish());
      rafRef.current.push(second);
    });
    rafRef.current.push(first);
  }, [finish]);

  // A real URL change through the history API: start if this is the first we
  // hear of it (navigateAdmin, router.push), then complete after the new page
  // paints. Same-URL bookkeeping calls Next makes are ignored.
  const onUrlSettled = useCallback(() => {
    const key = urlKey();
    if (key === lastKeyRef.current) return;
    lastKeyRef.current = key;
    ensureStarted();
    finishAfterPaint();
  }, [ensureStarted, finishAfterPaint]);

  useEffect(() => {
    lastKeyRef.current = urlKey();
    const originalPush = window.history.pushState;
    const originalReplace = window.history.replaceState;

    window.history.pushState = function patchedPush(
      this: History,
      data: unknown,
      unused: string,
      url?: string | URL | null,
    ) {
      const result = originalPush.call(this, data, unused, url);
      onUrlSettled();
      return result;
    } as History['pushState'];

    window.history.replaceState = function patchedReplace(
      this: History,
      data: unknown,
      unused: string,
      url?: string | URL | null,
    ) {
      const result = originalReplace.call(this, data, unused, url);
      onUrlSettled();
      return result;
    } as History['replaceState'];

    const onPopState = () => {
      const key = urlKey();
      if (key === lastKeyRef.current) return;
      lastKeyRef.current = key;
      start();
      finishAfterPaint();
    };

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest('a');
      if (!anchor || !anchor.href) return;
      if (anchor.target && anchor.target !== '_self') return;
      if (anchor.hasAttribute('download')) return;
      let url: URL;
      try {
        url = new URL(anchor.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
      if (`${url.pathname}${url.search}` === urlKey()) return;
      start();
    };

    window.addEventListener('popstate', onPopState);
    document.addEventListener('click', onClick, true);

    return () => {
      window.history.pushState = originalPush;
      window.history.replaceState = originalReplace;
      window.removeEventListener('popstate', onPopState);
      document.removeEventListener('click', onClick, true);
      clearTimers();
      activeRef.current = false;
      finishingRef.current = false;
    };
  }, [start, finishAfterPaint, onUrlSettled, clearTimers]);

  // Backup completion for route transitions: when the pathname changes while a
  // navigation is active, the new page has rendered. Skips the first mount.
  useEffect(() => {
    if (firstPathRef.current) {
      firstPathRef.current = false;
      return;
    }
    if (activeRef.current) finish();
  }, [pathname, finish]);

  return (
    <div
      aria-hidden="true"
      data-navigation-progress=""
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: '3px',
        zIndex: 9999,
        pointerEvents: 'none',
        opacity: visible ? 1 : 0,
        transition: 'opacity 200ms ease',
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${width}%`,
          borderRadius: '0 2px 2px 0',
          background:
            'linear-gradient(90deg, var(--color-primary), var(--color-unread, var(--color-primary)))',
          boxShadow:
            '0 0 8px color-mix(in srgb, var(--color-primary) 65%, transparent), 0 0 2px color-mix(in srgb, var(--color-primary) 80%, transparent)',
          transition: 'width 200ms ease',
        }}
      />
    </div>
  );
}