"use client";

import { useEffect, useState } from "react";
import { STREAM_GUARD_MS, within } from "@/lib/first-screen";

/** What a page read on the server for its first screen: the value, or its promise still streaming in. */
export type ServerReading<T> = T | null | Promise<T | null>;

// React marks a promise it streamed in `status` / `value` once it resolved: read at once, no extra render.
type Flight<T> = Promise<T | null> & { status?: string; value?: T | null };
const isFlight = <T>(r: ServerReading<T>): r is Flight<T> => typeof (r as Flight<T> | null)?.then === "function";
const now = <T>(r: ServerReading<T>): { value: T | null; settled: boolean } =>
  !isFlight(r) ? { value: r as T | null, settled: true } : r.status === "fulfilled" ? { value: r.value ?? null, settled: true } : { value: null, settled: false };

/** The server's reading once it arrived (`settled`): the page paints its caches meanwhile instead of waiting for it. */
export function useServerReading<T>(reading: ServerReading<T>): { value: T | null; settled: boolean } {
  const [got, setGot] = useState(() => now(reading));
  useEffect(() => {
    const at = now(reading);
    if (at.settled) {
      setGot((g) => (g.settled && g.value === at.value ? g : at));
      return;
    }
    let live = true;
    // A stream that never settles must not hold the page on its cache: past the guard, the view reads itself.
    void within(reading as Flight<T>, STREAM_GUARD_MS).then((value) => live && setGot({ value: value ?? null, settled: true }));
    return () => {
      live = false;
    };
  }, [reading]);
  return got;
}
