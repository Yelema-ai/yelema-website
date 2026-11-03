import { createHash } from "node:crypto";

// A second level under the process memo (lib/memo): Vercel's Runtime Cache, shared by the functions of one
// region (SHARED_SESSION_CACHE=on, C9 of the load plan). Only on Vercel and only when switched on; otherwise
// `sharedLayer` returns null and nothing is imported. Failures and refusals are never written (the caller
// only writes what a load returned); the cache down reads as a miss. Pure: the cache comes in, so it is tested.

export interface RuntimeCacheLike {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown, options?: { name?: string; tags?: string[]; ttl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface SharedLayer<T> {
  read(key: string): Promise<T | undefined>;
  write(key: string, value: T): Promise<void>;
  drop(key: string): Promise<void>;
}

export function sharedCacheOn(env: Record<string, string | undefined>): boolean {
  return env.SHARED_SESSION_CACHE?.trim().toLowerCase() === "on" && env.VERCEL === "1";
}

// The package's default key hash is 32 bits: two sessions could share an entry. SHA-256 instead.
export const sha256Key = (key: string): string => createHash("sha256").update(key).digest("hex");

/** `name` labels the entries for observability (never the key, which derives from a token). */
export function sharedLayer<T>(name: string, ttlSeconds: number, cache: () => Promise<RuntimeCacheLike>): SharedLayer<T> {
  let resolved: Promise<RuntimeCacheLike | null> | null = null;
  const store = () => (resolved ??= cache().catch(() => null));
  const quiet = async <R>(fn: (c: RuntimeCacheLike) => Promise<R>): Promise<R | undefined> => {
    try {
      const c = await store();
      return c ? await fn(c) : undefined;
    } catch {
      return undefined;
    }
  };
  return {
    read: async (key) => {
      const hit = await quiet((c) => c.get(key));
      return hit === null || hit === undefined ? undefined : (hit as T);
    },
    write: async (key, value) => void (await quiet((c) => c.set(key, value, { ttl: ttlSeconds, name }))),
    drop: async (key) => void (await quiet((c) => c.delete(key))),
  };
}

/** Vercel's Runtime Cache, imported only when switched on; a namespace per deployment, so no shape outlives its code. */
export async function vercelRuntimeCache(deployment: string): Promise<RuntimeCacheLike> {
  const { getCache } = await import("@vercel/functions");
  return getCache({ namespace: `yelema-session-${deployment}`, keyHashFunction: sha256Key });
}

/**
 * A load through the shared layer: its answer if it has one, else `load`, whose answer is written behind
 * (`background` keeps the host alive for it). A load that throws is never written; a refusal (`evicts`)
 * also drops the shared entry, so no other function serves it.
 */
export async function throughShared<T>(layer: SharedLayer<T>, key: string, load: () => Promise<T>, evicts: (e: unknown) => boolean, background: (p: Promise<void>) => void): Promise<T> {
  const hit = await layer.read(key);
  if (hit !== undefined) return hit;
  try {
    const value = await load();
    background(layer.write(key, value));
    return value;
  } catch (e) {
    if (evicts(e)) background(layer.drop(key));
    throw e;
  }
}
