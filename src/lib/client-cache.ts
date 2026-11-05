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

export function remember<T>(key: string, value: T): T {
  store.delete(key);
  store.set(key, { at: Date.now(), value });
  if (store.size > MAX_ENTRIES) store.delete(store.keys().next().value as string);
  for (const fn of listeners.get(key) ?? []) fn(value);
  return value;
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

export function forget(key: string): void {
  store.delete(key);
}

/**
 * One read for every component that asks the same thing at once, and none while the kept answer
 * is younger than `ttlMs`. A failure is never kept.
 */
export function cachedFetch<T>(key: string, load: () => Promise<T>, ttlMs = 0): Promise<T> {
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return Promise.resolve(hit.value as T);
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
