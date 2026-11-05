"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";

// Reading ahead what a click is about to open: a pointer resting 150 ms, a finger down, the keyboard's
// focus, or the row scrolling into view. Never on a line that asks to spare data, never in a hidden tab.
export const INTENT_MS = 150;

/** Whether the browser asked to spare data, or the network is too slow to read ahead. */
export function sparingData(): boolean {
  if (typeof navigator === "undefined") return true;
  const c = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return Boolean(c?.saveData) || c?.effectiveType === "slow-2g" || c?.effectiveType === "2g" || c?.effectiveType === "3g";
}

const allowed = () => !sparingData() && document.visibilityState === "visible";

type Timer = { current: ReturnType<typeof setTimeout> | null };

/** Pointer, touch and focus handlers that read ahead with `read`; `timer` is shared by a list's rows. */
export function intentOf(timer: Timer, read: () => void, delayMs = INTENT_MS) {
  const now = () => void (allowed() && read());
  return {
    onPointerEnter: () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(now, delayMs);
    },
    onPointerLeave: () => void (timer.current && clearTimeout(timer.current)),
    onTouchStart: now,
    onFocus: now,
  };
}

/** `intentOf` for one element (a pointer only reads after it rests). */
export function useIntent(read: () => void, delayMs = INTENT_MS) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(read);
  latest.current = read;
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  return useMemo(() => intentOf(timer, () => latest.current(), delayMs), [delayMs]);
}

/** Runs `fn` when the page is idle, unless data is to be spared. */
export function whenIdle(fn: () => void): void {
  if (allowed()) idle(fn);
}

// One observer for every row read ahead on sight; each row is read once, when the page is idle.
const seen = new WeakMap<Element, () => void>();
let observer: IntersectionObserver | null = null;
function watcher(): IntersectionObserver | null {
  if (observer || typeof IntersectionObserver === "undefined") return observer;
  observer = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const fn = seen.get(e.target);
      observer?.unobserve(e.target);
      seen.delete(e.target);
      if (fn && allowed()) idle(fn);
    }
  });
  return observer;
}

function idle(fn: () => void): void {
  const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  if (ric) ric(fn, { timeout: 3_000 });
  else setTimeout(fn, 200);
}

/** A ref that reads ahead with `read` the first time its element enters the viewport; null `read`: nothing. */
export function useInView<T extends Element>(read: (() => void) | null) {
  const latest = useRef(read);
  latest.current = read;
  const node = useRef<T | null>(null);
  return useCallback((el: T | null) => {
    const o = watcher();
    if (node.current && o) {
      o.unobserve(node.current);
      seen.delete(node.current);
    }
    node.current = el;
    if (!el || !o || !latest.current) return;
    seen.set(el, () => latest.current?.());
    o.observe(el);
  }, []);
}
