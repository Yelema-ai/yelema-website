export interface BurstTimers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  now(): number;
}

const browserTimers: BurstTimers = { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>), now: () => Date.now() };

/** `fn(key)` once calls for `key` stop for `quietMs`, and at the latest `maxMs` after the burst's first call. No imports: tested. */
export function afterBurst(fn: (key: string) => void, quietMs: number, maxMs: number, t: BurstTimers = browserTimers): (key: string) => void {
  const bursts = new Map<string, { first: number; timer: unknown }>();
  return (key) => {
    const now = t.now();
    const b = bursts.get(key);
    if (b) t.clearTimeout(b.timer);
    const first = b?.first ?? now;
    const wait = Math.max(0, Math.min(quietMs, first + maxMs - now));
    bursts.set(key, {
      first,
      timer: t.setTimeout(() => {
        bursts.delete(key);
        fn(key);
      }, wait),
    });
  };
}
