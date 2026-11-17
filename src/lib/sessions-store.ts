import type { ChatSession } from "../components/chat/types.ts";
import type { RoutineSession } from "./activity.ts";
import { createCache } from "./client-cache.ts";

// The tab's one copy of every space's conversations and routine runs (a space: an instance's home, `""`,
// or one Expert's profile), kept by lib/client-cache. Reads asked in the same tick for one instance leave
// as ONE grouped call; an event marks spaces stale and only those someone shows are read again.

export interface SpaceData {
  sessions: ChatSession[];
  /** null: not read with it (a page's first screen); the bell then asks for them. */
  runs: RoutineSession[] | null;
}

export interface SessionsDeps {
  /** One grouped read of several spaces of an instance; a space missing from the answer failed. */
  readMany(agentId: string, profiles: string[]): Promise<Record<string, SpaceData>>;
  now(): number;
  /** Runs `fn` once the current burst of reads or events is over, or `ms` later. */
  defer(fn: () => void, ms?: number): void;
  /** Keeps a fresh reading on the device (lib/device-cache-client). */
  persist?(agentId: string, profile: string, data: SpaceData): void;
}

/** The most spaces one grouped read carries (and the `chat/by-profile` route accepts). */
export const MAX_SPACES = 40;
// A space that failed answers that failure this long without a call; one on screen is retried once after.
export const FAIL_MS = 2_000;

type Waiter = { resolve: (d: SpaceData) => void; reject: (e: unknown) => void };

const keyOf = (agentId: string, profile: string) => `${agentId}|${profile}`;
const spaceOf = (key: string): [string, string] => {
  const i = key.indexOf("|");
  return [key.slice(0, i), key.slice(i + 1)];
};

export function createSessionsStore(deps: SessionsDeps, { maxEntries = 200 } = {}) {
  const cache = createCache({ maxEntries, now: deps.now, persist: deps.persist && ((k, v) => deps.persist!(...spaceOf(k), v as SpaceData)) });
  const queued = new Map<string, Map<string, Waiter[]>>();
  const stale = new Set<string>();
  // Changed while its read was in flight: that read goes out once more before anyone is answered.
  const dirty = new Set<string>();
  const failed = new Map<string, { until: number; error: unknown; streak: number }>();
  let flushQueued = false;

  async function flush(agentId: string, batch: Map<string, Waiter[]>): Promise<void> {
    const profiles = [...batch.keys()];
    for (let i = 0; i < profiles.length; i += MAX_SPACES) {
      const part = profiles.slice(i, i + MAX_SPACES);
      let got: Record<string, SpaceData> = {};
      let failure: unknown = new Error("space unavailable");
      try {
        got = await deps.readMany(agentId, part);
      } catch (e) {
        failure = e;
      }
      for (const p of part) for (const w of batch.get(p) ?? []) (got[p] ? w.resolve(got[p]) : w.reject(failure));
    }
  }

  function ask(agentId: string, profile: string): Promise<SpaceData> {
    return new Promise<SpaceData>((resolve, reject) => {
      const batch = queued.get(agentId) ?? new Map<string, Waiter[]>();
      queued.set(agentId, batch);
      batch.set(profile, [...(batch.get(profile) ?? []), { resolve, reject }]);
      if (flushQueued) return;
      flushQueued = true;
      deps.defer(() => {
        flushQueued = false;
        const all = [...queued];
        queued.clear();
        for (const [a, b] of all) void flush(a, b);
      });
    });
  }

  function fetch(key: string, ttlMs: number): Promise<SpaceData> {
    return cache.cachedFetch(
      key,
      async () => {
        try {
          let data: SpaceData;
          do {
            dirty.delete(key);
            data = await ask(...spaceOf(key));
          } while (dirty.has(key));
          failed.delete(key);
          return data;
        } catch (error) {
          const streak = (failed.get(key)?.streak ?? 0) + 1;
          failed.set(key, { until: deps.now() + FAIL_MS, error, streak });
          if (streak === 1 && cache.watched(key)) deps.defer(() => void fetch(key, 0).catch(() => undefined), FAIL_MS);
          throw error;
        }
      },
      ttlMs
    );
  }

  function load(key: string, ttlMs: number): Promise<SpaceData> {
    const f = failed.get(key);
    if (f && deps.now() < f.until && !cache.fresh(key, ttlMs)) return Promise.reject(f.error);
    return fetch(key, ttlMs);
  }

  return {
    get: (agentId: string, profile: string): SpaceData | undefined => cache.cached<SpaceData>(keyOf(agentId, profile)),
    /** The space at most `maxAgeMs` old and not marked stale; a read in flight is shared. */
    read(agentId: string, profile: string, maxAgeMs = 30_000): Promise<SpaceData> {
      const key = keyOf(agentId, profile);
      return load(key, stale.delete(key) ? 0 : maxAgeMs);
    },
    /** What the server already read (the page, the bootstrap): kept as a fresh reading. */
    put(agentId: string, profile: string, data: SpaceData): void {
      stale.delete(keyOf(agentId, profile));
      cache.remember(keyOf(agentId, profile), data);
    },
    /** The bootstrap's copy: older than an event heard since, so never over a space marked stale or changed in flight. */
    seed(agentId: string, profile: string, data: SpaceData): void {
      const key = keyOf(agentId, profile);
      if (!stale.has(key) && !dirty.has(key)) cache.remember(key, data);
    },
    /** True when `read` would answer from what is held (or join a read under way), without a call. */
    fresh(agentId: string, profile: string, maxAgeMs = 30_000): boolean {
      const key = keyOf(agentId, profile);
      return !stale.has(key) && cache.fresh(key, maxAgeMs);
    },
    /** A copy kept on the device: shown at once but stale, so the first read goes out. Never over a reading. */
    hydrate: (agentId: string, profile: string, data: SpaceData): void => cache.hydrate(keyOf(agentId, profile), data),
    /** True while the space shown is only the device's copy. */
    fromDevice: (agentId: string, profile: string): boolean => cache.keptOnly(keyOf(agentId, profile)),
    /** Something changed (`profile` undefined: every space of the instance): shown spaces are read again. */
    invalidate(agentId: string, profile?: string, { answeredWithinMs = 0 } = {}): void {
      const prefix = keyOf(agentId, "");
      // `answeredWithinMs`: a space answered that recently already says what the event would read again.
      const recent = (k: string) => answeredWithinMs > 0 && !cache.loading(k) && cache.fresh(k, answeredWithinMs);
      const hit = cache.keys().filter((k) => (profile === undefined ? k.startsWith(prefix) : k === keyOf(agentId, profile)) && !recent(k));
      for (const k of hit) (cache.loading(k) ? dirty : stale).add(k);
      deps.defer(() => {
        for (const k of hit) if (cache.watched(k) && stale.delete(k)) void load(k, 0).catch(() => undefined);
      });
    },
    subscribe: (agentId: string, profile: string, fn: (d: SpaceData) => void): (() => void) => cache.subscribe(keyOf(agentId, profile), fn),
    size: cache.size,
  };
}

export type SessionsStore = ReturnType<typeof createSessionsStore>;
