// What the browser has already read, kept until the page is reloaded (signing out reloads it).
// A screen opened again shows this at once and reads anew behind it, instead of starting empty.
// Keys carry the user when the answer is theirs alone: a tab can outlive a session. Bounded: a tab left
// open for days keeps the latest answers only (a key someone listens to is never dropped).

export interface CacheOptions {
  maxEntries?: number;
  now?: () => number;
  /** Where a fresh reading is also kept (lib/device-cache-client). */
  persist?: (key: string, value: unknown) => void;
}

export function createCache({ maxEntries = 300, now = Date.now, persist }: CacheOptions = {}) {
  const store = new Map<string, { at: number; value: unknown }>();
  const flying = new Map<string, Promise<unknown>>();
  const listeners = new Map<string, Set<(value: unknown) => void>>();
  const young = (key: string, ttlMs: number) => {
    const hit = store.get(key);
    return Boolean(hit && hit.at > 0 && now() - hit.at < ttlMs);
  };

  function keep(key: string, value: unknown, at: number): void {
    store.delete(key);
    store.set(key, { at, value });
    for (const k of store.keys()) {
      if (store.size <= maxEntries) break;
      if (!listeners.has(k)) store.delete(k);
    }
    for (const fn of [...(listeners.get(key) ?? [])]) fn(value);
  }

  function remember<T>(key: string, value: T): T {
    keep(key, value, now());
    persist?.(key, value);
    return value;
  }

  function subscribe<T>(key: string, fn: (value: T) => void): () => void {
    const set = listeners.get(key) ?? new Set();
    set.add(fn as (value: unknown) => void);
    listeners.set(key, set);
    return () => {
      set.delete(fn as (value: unknown) => void);
      if (!set.size && listeners.get(key) === set) listeners.delete(key);
    };
  }

  function settle<T>(key: string, promise: Promise<T>): Promise<T> {
    const p = promise.then(
      (value) => {
        flying.delete(key);
        return remember(key, value);
      },
      (e: unknown) => {
        flying.delete(key);
        throw e;
      }
    );
    flying.set(key, p);
    return p;
  }

  return {
    cached: <T>(key: string): T | undefined => store.get(key)?.value as T | undefined,
    remember,
    /** A copy kept on the device: shown at once, but stale, so the next `cachedFetch` reads anew. Never over a fresher one. */
    hydrate(key: string, value: unknown): void {
      if (!store.has(key)) keep(key, value, 0);
    },
    /** What the server already read (the page, the bootstrap): kept unless a reading of this tab is held. */
    seed(key: string, value: unknown): void {
      if (!store.has(key) || store.get(key)!.at === 0) remember(key, value);
    },
    /** Hears every new value remembered under `key` (another component read it anew). */
    subscribe,
    watched: (key: string): boolean => listeners.has(key),
    /** True when `key` holds a value younger than `ttlMs`, or a read of it is under way. */
    fresh: (key: string, ttlMs: number): boolean => flying.has(key) || young(key, ttlMs),
    loading: (key: string): boolean => flying.has(key),
    /** True while the value held is only the device's copy (lib/device-cache-client). */
    keptOnly: (key: string): boolean => store.get(key)?.at === 0,
    /** `fn` gets the value held under `key` now, or the first one remembered later (the device's copy arriving). */
    whenKept<T>(key: string, fn: (value: T) => void): () => void {
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
    },
    forget(key: string): void {
      store.delete(key);
    },
    /** One read for every component that asks the same thing at once, and none while the kept answer is younger than `ttlMs`. A failure is never kept. */
    cachedFetch<T>(key: string, load: () => Promise<T>, ttlMs = 0): Promise<T> {
      if (young(key, ttlMs)) return Promise.resolve(store.get(key)!.value as T);
      return (flying.get(key) as Promise<T> | undefined) ?? settle(key, load());
    },
    /**
     * A grouped read under way (one route for a whole screen) answers `key`: readers asking meanwhile join it.
     * A part it leaves out (null) or a failure falls back to `fallback`, the key's own read.
     */
    pending<T>(key: string, part: Promise<T | null>, fallback: () => Promise<T>, ttlMs = 0): void {
      if (flying.has(key) || young(key, ttlMs)) return;
      settle(key, part.then((v) => (v === null || v === undefined ? fallback() : v), () => fallback())).catch(() => undefined);
    },
    /** Every key held or listened to. */
    keys: (): string[] => [...new Set([...store.keys(), ...listeners.keys()])],
    size: () => ({ entries: store.size, listeners: listeners.size }),
  };
}

export type Cache = ReturnType<typeof createCache>;

// The tab's shared cache. Where its readings are also kept on the device: set by lib/device-cache-client.
let sink: ((key: string, value: unknown) => void) | null = null;
export function persistTo(fn: ((key: string, value: unknown) => void) | null): void {
  sink = fn;
}

const shared = createCache({ persist: (k, v) => sink?.(k, v) });
export const { cached, remember, hydrate, seed, subscribe, fresh, keptOnly, whenKept, forget, cachedFetch, pending } = shared;
