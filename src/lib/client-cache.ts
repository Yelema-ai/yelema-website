// What the browser has already read, kept until the page is reloaded (signing out reloads it).
// A screen opened again shows this at once and reads anew behind it, instead of starting empty.
// Keys carry the user when the answer is theirs alone: a tab can outlive a session. Bounded: a tab left
// open for days keeps the latest answers only.
const MAX_ENTRIES = 300;
const store = new Map<string, { at: number; value: unknown }>();
const flying = new Map<string, Promise<unknown>>();
const listeners = new Map<string, Set<(value: unknown) => void>>();

export function cached<T>(key: string): T | undefined {
  return store.get(key)?.value as T | undefined;
}

// Where a remembered value is also kept on the device (lib/device-cache-client); none in tests.
let persist: ((key: string, value: unknown) => void) | null = null;
export function persistTo(sink: ((key: string, value: unknown) => void) | null): void {
  persist = sink;
}

function keep(key: string, value: unknown, at: number): void {
  store.delete(key);
  store.set(key, { at, value });
  if (store.size > MAX_ENTRIES) store.delete(store.keys().next().value as string);
  for (const fn of listeners.get(key) ?? []) fn(value);
}

export function remember<T>(key: string, value: T): T {
  keep(key, value, Date.now());
  persist?.(key, value);
  return value;
}

/** A copy kept on the device: shown at once, but stale, so the next `cachedFetch` reads anew. Never over a fresher one. */
export function hydrate(key: string, value: unknown): void {
  if (!store.has(key)) keep(key, value, 0);
}

/** Hears every new value remembered under `key` (another component read it anew). */
export function subscribe<T>(key: string, fn: (value: T) => void): () => void {
  const set = listeners.get(key) ?? new Set();
  set.add(fn as (value: unknown) => void);
  listeners.set(key, set);
  return () => {
    set.delete(fn as (value: unknown) => void);
    if (!set.size && listeners.get(key) === set) listeners.delete(key);
  };
}

/** True when `key` holds a value younger than `ttlMs`, or a read of it is under way. */
export function fresh(key: string, ttlMs: number): boolean {
  const hit = store.get(key);
  return flying.has(key) || Boolean(hit && hit.at > 0 && Date.now() - hit.at < ttlMs);
}

/** True while the value held is only the device's copy (lib/device-cache-client). */
export function keptOnly(key: string): boolean {
  return store.get(key)?.at === 0;
}

/** `fn` gets the value held under `key` now, or the first one remembered later (the device's copy arriving). */
export function whenKept<T>(key: string, fn: (value: T) => void): () => void {
  const hit = store.get(key);
  if (hit) {
    fn(hit.value as T);
    return () => undefined;
  }
  const off = subscribe<T>(key, (v) => {
    off();
    fn(v);
  });
  return off;
}

export function forget(key: string): void {
  store.delete(key);
}

/**
 * One read for every component that asks the same thing at once, and none while the kept answer
 * is younger than `ttlMs`. A failure is never kept.
 */
export function cachedFetch<T>(key: string, load: () => Promise<T>, ttlMs = 0): Promise<T> {
  const hit = store.get(key);
  if (hit && hit.at > 0 && Date.now() - hit.at < ttlMs) return Promise.resolve(hit.value as T);
  const running = flying.get(key);
  if (running) return running as Promise<T>;
  const promise = load().then(
    (value) => {
      flying.delete(key);
      return remember(key, value);
    },
    (e: unknown) => {
      flying.delete(key);
      throw e;
    }
  );
  flying.set(key, promise);
  return promise;
}

/**
 * A grouped read under way (one route for a whole screen) answers `key`: readers asking meanwhile join it.
 * A part it leaves out (null) or a failure falls back to `fallback`, the key's own read.
 */
export function pending<T>(key: string, part: Promise<T | null>, fallback: () => Promise<T>, ttlMs = 0): void {
  const hit = store.get(key);
  if (flying.has(key) || (hit && hit.at > 0 && Date.now() - hit.at < ttlMs)) return;
  const promise = part
    .then((v) => (v === null || v === undefined ? fallback() : v), () => fallback())
    .then(
      (value) => {
        flying.delete(key);
        return remember(key, value);
      },
      (e: unknown) => {
        flying.delete(key);
        throw e;
      }
    );
  promise.catch(() => undefined);
  flying.set(key, promise);
}
