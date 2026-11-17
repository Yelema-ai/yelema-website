"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { MAX_BATCH, WINDOW_MS, measured, screenOf, type RumRecord } from "@/lib/rum";

// Measures each screen of a sampled tab (lib/rum) and sends the records by beacon when the tab hides.
// Mounted once in the root layout; renders nothing.

type Live = RumRecord & { start: number; lastInteraction: number };

const SKELETON = '[aria-busy="true"], .animate-pulse';
const SAMPLE_KEY = "yelema.rum.sampled";

const state = { on: false, hard: true, current: null as Live | null, queue: [] as RumRecord[], lastClick: -1, stopWatch: () => {} };

function inSample(rate: number): boolean {
  try {
    const kept = sessionStorage.getItem(SAMPLE_KEY);
    if (kept === "1" || kept === "0") return kept === "1";
    const on = Math.random() < rate;
    sessionStorage.setItem(SAMPLE_KEY, on ? "1" : "0");
    return on;
  } catch {
    return Math.random() < rate;
  }
}

function send(): void {
  if (!state.queue.length) return;
  const records = state.queue.splice(0, MAX_BATCH);
  try {
    navigator.sendBeacon("/api/rum", new Blob([JSON.stringify({ records })], { type: "application/json" }));
  } catch {
    // A lost sample is not worth a retry.
  }
  if (state.queue.length) send();
}

function finish(): void {
  state.stopWatch();
  const c = state.current;
  state.current = null;
  if (!c) return;
  state.queue.push({ screen: c.screen, nav: c.nav, render: c.render, inp: c.inp, interactions: c.interactions, api: c.api });
  if (state.queue.length >= MAX_BATCH) send();
}

/** Route content is there when `<main>` has text and no skeleton left; checked on each DOM change, at most once a frame. */
function watchRender(live: Live): () => void {
  let frame = 0;
  const check = () => {
    frame = 0;
    const main = document.querySelector("main");
    if (!main || !main.textContent?.trim() || main.querySelector(SKELETON)) return;
    live.render = Math.max(0, performance.now() - live.start);
    stop();
  };
  const mo = new MutationObserver(() => (frame ||= requestAnimationFrame(check)));
  const timer = setTimeout(() => stop(), WINDOW_MS);
  const stop = () => {
    mo.disconnect();
    clearTimeout(timer);
    if (frame) cancelAnimationFrame(frame);
  };
  mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "aria-busy"] });
  frame = requestAnimationFrame(check);
  return stop;
}

function startScreen(pathname: string): void {
  finish();
  const hard = state.hard;
  state.hard = false;
  if (!measured(pathname)) return;
  const now = performance.now();
  const start = hard ? 0 : state.lastClick >= 0 && now - state.lastClick < 1_500 ? state.lastClick : now;
  const live: Live = { screen: screenOf(pathname), nav: hard ? "hard" : "soft", render: null, inp: null, interactions: 0, api: 0, start, lastInteraction: 0 };
  state.current = live;
  state.stopWatch = watchRender(live);
}

function attach(): () => void {
  const observers: PerformanceObserver[] = [];
  const observe = (type: string, cb: (e: PerformanceEntry) => void, extra: Record<string, unknown> = {}) => {
    try {
      const po = new PerformanceObserver((list) => list.getEntries().forEach(cb));
      po.observe({ type, buffered: true, ...extra } as PerformanceObserverInit);
      observers.push(po);
    } catch {
      // Event Timing is missing in some browsers (Safari): that metric stays null.
    }
  };
  observe(
    "event",
    (e) => {
      const ev = e as PerformanceEntry & { interactionId?: number };
      const c = state.current;
      if (!c || !ev.interactionId || ev.startTime < c.start) return;
      if (ev.interactionId !== c.lastInteraction) {
        c.interactions += 1;
        c.lastInteraction = ev.interactionId;
      }
      c.inp = Math.max(c.inp ?? 0, ev.duration);
    },
    { durationThreshold: 16 },
  );
  observe("resource", (e) => {
    const c = state.current;
    if (!c || e.startTime < c.start || e.startTime > c.start + WINDOW_MS) return;
    try {
      const u = new URL(e.name);
      if (u.origin === location.origin && u.pathname.startsWith("/api/") && u.pathname !== "/api/rum") c.api += 1;
    } catch {
      // Not a URL: not ours.
    }
  });
  const onDown = (ev: Event) => void (state.lastClick = ev.timeStamp);
  const onHide = () => {
    if (document.visibilityState !== "hidden") return;
    finish();
    send();
  };
  addEventListener("pointerdown", onDown, { capture: true, passive: true });
  addEventListener("keydown", onDown, { capture: true, passive: true });
  document.addEventListener("visibilitychange", onHide);
  addEventListener("pagehide", onHide);
  return () => {
    observers.forEach((o) => o.disconnect());
    removeEventListener("pointerdown", onDown, { capture: true });
    removeEventListener("keydown", onDown, { capture: true });
    document.removeEventListener("visibilitychange", onHide);
    removeEventListener("pagehide", onHide);
    state.on = false;
  };
}

export function RumReporter({ sampleRate }: { sampleRate: number }) {
  const pathname = usePathname();
  useEffect(() => {
    if (sampleRate <= 0 || state.on || !inSample(sampleRate)) return;
    state.on = true;
    return attach();
  }, [sampleRate]);
  useEffect(() => {
    if (state.on && pathname) startScreen(pathname);
  }, [pathname]);
  return null;
}
