// What a screen last showed, kept on the device so it paints at once on the next visit, then refreshes.
// One account + space at a time: opening another wipes everything, and a tab of another one stops writing.
// A row older than MAX_AGE_MS (a day for message content) is dropped. Never tokens, secrets or file contents.
// Pure: the storage comes in (IndexedDB in the browser, a Map in tests).

export interface CacheRow {
  key: string;
  value: unknown;
  /** Last written or read (ms): the least recent goes first past the size bound. */
  at: number;
  size: number;
}

export interface Meta {
  scope: string;
  version: number;
}

export interface CacheBackend {
  getAll(): Promise<CacheRow[]>;
  /** With `meta`: written only if the stored meta is still that one, in the same transaction; false when refused. */
  put(rows: CacheRow[], meta?: Meta): Promise<boolean>;
  delete(keys: string[]): Promise<void>;
  clear(): Promise<void>;
}

export const META_KEY = "__meta";
export const MAX_AGE_MS = 7 * 24 * 3_600_000;
/** Message content (a thread, a Buzz exchange) is kept a day only. */
export const CONTENT_MAX_AGE_MS = 24 * 3_600_000;
// Kept a day: a thread, and what an expert's pack recommends (read again past 10 min anyway).
const CONTENT = ["chat:", "buzz:thread", "expert-tools:"];
export const maxAgeOf = (key: string): number => (CONTENT.some((p) => key.startsWith(p)) ? CONTENT_MAX_AGE_MS : MAX_AGE_MS);
export const sameMeta = (stored: unknown, meta: Meta): boolean => {
  const m = stored as Partial<Meta> | undefined;
  return m?.scope === meta.scope && m?.version === meta.version;
};
const SECRET_FIELD = /^(access_?token|refresh_?token|id_?token|token|secret|password|passwd|api_?key|authorization|cookie|private_?key|nsec)$/i;

/** True when a value carries a field named like a credential anywhere inside it: such a value is never kept. */
export function carriesSecret(value: unknown, depth = 0): boolean {
  if (depth > 12 || value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((v) => carriesSecret(v, depth + 1));
  return Object.entries(value).some(([k, v]) => (SECRET_FIELD.test(k) && v != null && v !== "") || carriesSecret(v, depth + 1));
}

const SIGNED_URL = /[?&](token|sig|signature|x-amz-signature|x-amz-credential|se?cret)=/i;

/** A copy with every signed address (a token in its query) set to null: an image then waits for the fresh reading. */
export function scrubSigned<T>(value: T, depth = 0): T {
  if (typeof value === "string") return (SIGNED_URL.test(value) && /^(https?:\/\/|\/)/.test(value) ? null : value) as T;
  if (depth > 12 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => scrubSigned(v, depth + 1)) as T;
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, scrubSigned(v, depth + 1)])) as T;
}

export interface DeviceCacheOptions {
  version: number;
  maxBytes: number;
  now?: () => number;
  /** Runs `fn` once the current burst of writes is over. */
  defer?: (fn: () => void) => void;
}

type Idle = (fn: () => void, o: { timeout: number }) => number;
// After the burst, when the page is idle: the copy, the size and the secret check run there, not in `set`.
function afterBurst(fn: () => void): void {
  setTimeout(() => {
    const ric = (globalThis as { requestIdleCallback?: Idle }).requestIdleCallback;
    if (ric) ric(fn, { timeout: 1_000 });
    else fn();
  }, 250);
}

export function createDeviceCache(backend: CacheBackend, { version, maxBytes, now = Date.now, defer = afterBurst }: DeviceCacheOptions) {
  const rows = new Map<string, CacheRow>();
  const dirty = new Set<string>();
  // Handed to `set`, not yet copied or checked: the latest value per key, with when it was set.
  const raw = new Map<string, { value: unknown; at: number }>();
  let scope: string | null = null;
  let loaded: string | null = null;
  let bytes = 0;
  let flushing = false;
  let opened: Promise<void> = Promise.resolve();

  function drop(key: string): void {
    const r = rows.get(key);
    if (!r) return;
    bytes -= r.size;
    rows.delete(key);
  }

  function evict(): string[] {
    const gone: string[] = [];
    if (bytes <= maxBytes) return gone;
    for (const r of [...rows.values()].sort((a, b) => a.at - b.at)) {
      if (bytes <= maxBytes) break;
      drop(r.key);
      dirty.delete(r.key);
      gone.push(r.key);
    }
    return gone;
  }

  function schedule(): void {
    if (flushing) return;
    flushing = true;
    defer(() => void flush());
  }

  // A value handed to `set` becomes a row: scrubbed, measured, refused when too large or carrying a secret.
  function commit(key: string): void {
    const r = raw.get(key);
    if (!r) return;
    raw.delete(key);
    let size: number;
    const value = scrubSigned(r.value);
    try {
      size = JSON.stringify(value).length * 2;
    } catch {
      return;
    }
    if (size > maxBytes / 2 || carriesSecret(value)) return;
    drop(key);
    rows.set(key, { key, value, at: r.at, size });
    bytes += size;
    dirty.add(key);
  }

  function commitAll(): void {
    for (const k of [...raw.keys()]) commit(k);
    const gone = evict();
    if (gone.length) void backend.delete(gone).catch(() => undefined);
  }

  async function flush(): Promise<void> {
    await opened;
    flushing = false;
    commitAll();
    const keys = [...dirty];
    dirty.clear();
    const put = keys.map((k) => rows.get(k)).filter((r): r is CacheRow => Boolean(r));
    if (!put.length || !scope) return;
    // Another tab opened another account or space, or wiped: this one stops writing.
    if ((await backend.put(put, { scope, version }).catch(() => true)) === false) close();
  }

  function close(): void {
    scope = null;
    loaded = null;
    rows.clear();
    dirty.clear();
    raw.clear();
    bytes = 0;
    opened = Promise.resolve();
  }

  async function load(next: string): Promise<void> {
    let all: CacheRow[] = [];
    try {
      all = await backend.getAll();
    } catch {
      if (scope === next) loaded = next;
      return;
    }
    if (scope !== next) return;
    // Another account or space, or an older layout: nothing of it is shown.
    if (!sameMeta(all.find((r) => r.key === META_KEY)?.value, { scope: next, version })) {
      await backend.clear().catch(() => undefined);
      await backend.put([{ key: META_KEY, value: { scope: next, version }, at: now(), size: 0 }]).catch(() => false);
      if (scope === next) loaded = next;
      return;
    }
    const old: string[] = [];
    for (const r of all) {
      if (r.key === META_KEY || rows.has(r.key) || raw.has(r.key)) continue;
      if (now() - r.at > maxAgeOf(r.key)) old.push(r.key);
      else {
        rows.set(r.key, r);
        bytes += r.size;
      }
    }
    loaded = next;
    const gone = [...old, ...evict()];
    if (gone.length) await backend.delete(gone).catch(() => undefined);
  }

  return {
    /** Opens the account+space `next`; another one held is wiped. Resolves once its rows are readable. */
    open(next: string): Promise<void> {
      if (scope === next) return opened;
      scope = next;
      loaded = null;
      rows.clear();
      dirty.clear();
      raw.clear();
      bytes = 0;
      opened = load(next);
      return opened;
    },
    scope: () => scope,
    /** True once the open space's rows are readable. */
    ready: () => scope !== null && loaded === scope,
    get<T>(key: string): T | undefined {
      if (raw.has(key)) {
        commit(key);
        const gone = evict();
        if (gone.length) void backend.delete(gone).catch(() => undefined);
      }
      const r = rows.get(key);
      if (!r) return undefined;
      r.at = now();
      return r.value as T;
    },
    /** Keeps `value` (JSON-able) under `key`, checked once the burst is over; refused when no space is open (false), too large or carrying a secret. */
    set(key: string, value: unknown): boolean {
      if (!scope || key === META_KEY) return false;
      raw.set(key, { value, at: now() });
      schedule();
      return true;
    },
    remove(key: string): void {
      raw.delete(key);
      drop(key);
      dirty.delete(key);
      void backend.delete([key]).catch(() => undefined);
    },
    /** Signing out: nothing is left on the device. */
    async wipe(): Promise<void> {
      close();
      await backend.clear().catch(() => undefined);
    },
    /** Another tab took the device: this one forgets what it holds and writes nothing more. */
    close,
    /** Keys of the rows kept: a value just set is checked first, so a refused one is never listed. */
    keys(): string[] {
      if (raw.size) commitAll();
      return [...rows.keys()];
    },
    /** Bytes of the rows already checked (a value just set counts once the burst is over). */
    bytes: () => bytes,
    flush,
  };
}

export type DeviceCache = ReturnType<typeof createDeviceCache>;

/** The page is left or hidden: what is pending is written now, not after a burst that may never end. */
export function flushOnHide(cache: Pick<DeviceCache, "flush">, target: EventTarget, hidden: () => boolean): void {
  const now = () => void cache.flush().catch(() => undefined);
  target.addEventListener("pagehide", now);
  target.addEventListener("visibilitychange", () => hidden() && now());
}

/** A Map in place of IndexedDB (tests, or a browser without it). */
export function memoryBackend(seed: CacheRow[] = []): CacheBackend & { rows: Map<string, CacheRow> } {
  const m = new Map(seed.map((r) => [r.key, r]));
  return {
    rows: m,
    getAll: async () => [...m.values()].map((r) => ({ ...r })),
    put: async (rs, meta) => {
      if (meta && !sameMeta(m.get(META_KEY)?.value, meta)) return false;
      rs.forEach((r) => m.set(r.key, { ...r }));
      return true;
    },
    delete: async (ks) => void ks.forEach((k) => m.delete(k)),
    clear: async () => m.clear(),
  };
}

/** A short stable name for the account (FNV-1a): the device does not keep the address in clear. */
export function accountHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(36);
}
