import type { ChatSession } from "../components/chat/types.ts";
import type { RoutineSession } from "./activity.ts";

// The tab's one copy of every space's conversations and routine runs (a space: an instance's home, `""`,
// or one Expert's profile). Reads asked in the same tick for one instance leave as ONE grouped call;
// an event marks spaces stale and only those someone shows are read again. Pure: deps come in, tested.

export interface SpaceData {
  sessions: ChatSession[];
  /** null: not read with it (a page's first screen); the bell then asks for them. */
  runs: RoutineSession[] | null;
}

export interface SessionsDeps {
  /** One grouped read of several spaces of an instance; a space missing from the answer failed. */
  readMany(agentId: string, profiles: string[]): Promise<Record<string, SpaceData>>;
  now(): number;
  /** Runs `fn` once the current burst of reads or events is over. */
  defer(fn: () => void): void;
}

export const BATCH_MAX = 40;
const MAX_SPACES = 200;

type Entry = { at: number; data: SpaceData };
type Waiter = { resolve: (d: SpaceData) => void; reject: (e: unknown) => void };
type Listener = (d: SpaceData) => void;

const keyOf = (agentId: string, profile: string) => `${agentId}|${profile}`;

export function createSessionsStore(deps: SessionsDeps, { maxSpaces = MAX_SPACES } = {}) {
  const entries = new Map<string, Entry>();
  const listeners = new Map<string, Set<Listener>>();
  const flying = new Map<string, Promise<SpaceData>>();
  const queued = new Map<string, Map<string, Waiter[]>>();
  const stale = new Set<string>();
  let flushQueued = false;

  function keep(key: string, data: SpaceData, at: number): void {
    entries.delete(key);
    entries.set(key, { at, data });
    for (const k of entries.keys()) {
      if (entries.size <= maxSpaces) break;
      if (!listeners.has(k)) entries.delete(k);
    }
    for (const fn of [...(listeners.get(key) ?? [])]) fn(data);
  }

  async function flush(agentId: string, batch: Map<string, Waiter[]>): Promise<void> {
    const profiles = [...batch.keys()];
    for (let i = 0; i < profiles.length; i += BATCH_MAX) {
      const part = profiles.slice(i, i + BATCH_MAX);
      let got: Record<string, SpaceData> = {};
      let failure: unknown = new Error("space unavailable");
      try {
        got = await deps.readMany(agentId, part);
      } catch (e) {
        failure = e;
      }
      for (const p of part) {
        const data = got[p];
        if (data) keep(keyOf(agentId, p), data, deps.now());
        for (const w of batch.get(p) ?? []) (data ? w.resolve(data) : w.reject(failure));
      }
    }
  }

  function load(agentId: string, profile: string): Promise<SpaceData> {
    const key = keyOf(agentId, profile);
    const running = flying.get(key);
    if (running) return running;
    const promise = new Promise<SpaceData>((resolve, reject) => {
      const batch = queued.get(agentId) ?? new Map<string, Waiter[]>();
      queued.set(agentId, batch);
      batch.set(profile, [...(batch.get(profile) ?? []), { resolve, reject }]);
    }).finally(() => flying.delete(key));
    flying.set(key, promise);
    if (!flushQueued) {
      flushQueued = true;
      deps.defer(() => {
        flushQueued = false;
        const all = [...queued];
        queued.clear();
        for (const [a, batch] of all) void flush(a, batch);
      });
    }
    return promise;
  }

  return {
    get: (agentId: string, profile: string): SpaceData | undefined => entries.get(keyOf(agentId, profile))?.data,
    /** The space at most `maxAgeMs` old and not marked stale; a read in flight is shared. */
    read(agentId: string, profile: string, maxAgeMs = 30_000): Promise<SpaceData> {
      const key = keyOf(agentId, profile);
      const hit = entries.get(key);
      if (hit && !stale.has(key) && deps.now() - hit.at < maxAgeMs) return Promise.resolve(hit.data);
      stale.delete(key);
      return load(agentId, profile);
    },
    /** What the server already read (the page, the bootstrap): kept as a fresh reading. */
    put(agentId: string, profile: string, data: SpaceData, at = deps.now()): void {
      stale.delete(keyOf(agentId, profile));
      keep(keyOf(agentId, profile), data, at);
    },
    /** Something changed (`profile` undefined: every space of the instance): shown spaces are read again. */
    invalidate(agentId: string, profile?: string): void {
      const prefix = keyOf(agentId, "");
      const hit = [...new Set([...entries.keys(), ...listeners.keys()])].filter((k) => (profile === undefined ? k.startsWith(prefix) : k === keyOf(agentId, profile)));
      for (const k of hit) stale.add(k);
      deps.defer(() => {
        for (const k of hit) {
          if (!stale.has(k) || !listeners.has(k)) continue;
          stale.delete(k);
          void load(agentId, k.slice(prefix.length)).catch(() => undefined);
        }
      });
    },
    subscribe(agentId: string, profile: string, fn: Listener): () => void {
      const key = keyOf(agentId, profile);
      const set = listeners.get(key) ?? new Set<Listener>();
      listeners.set(key, set);
      set.add(fn);
      return () => {
        set.delete(fn);
        if (!set.size && listeners.get(key) === set) listeners.delete(key);
      };
    },
    size: () => ({ entries: entries.size, listeners: listeners.size }),
  };
}

export type SessionsStore = ReturnType<typeof createSessionsStore>;
