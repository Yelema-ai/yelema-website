// What a screen last showed, kept on the device so it paints at once on the next visit, then refreshes.
// One account + space at a time: opening another wipes everything. Never tokens, secrets or file contents.
// Pure: the storage comes in (IndexedDB in the browser, a Map in tests).

export interface CacheRow {
  key: string;
  value: unknown;
  /** Last written or read (ms): the least recent goes first past the size bound. */
  at: number;
  size: number;
}

export interface CacheBackend {
  getAll(): Promise<CacheRow[]>;
  put(rows: CacheRow[]): Promise<void>;
  delete(keys: string[]): Promise<void>;
  clear(): Promise<void>;
}

export const META_KEY = "__meta";
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

export function createDeviceCache(backend: CacheBackend, { version, maxBytes, now = Date.now, defer = (fn) => void setTimeout(fn, 250) }: DeviceCacheOptions) {
  const rows = new Map<string, CacheRow>();
  const dirty = new Set<string>();
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

  async function flush(): Promise<void> {
    await opened;
    flushing = false;
    const keys = [...dirty];
    dirty.clear();
    const put = keys.map((k) => rows.get(k)).filter((r): r is CacheRow => Boolean(r));
    if (put.length) await backend.put(put).catch(() => undefined);
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
    const meta = all.find((r) => r.key === META_KEY)?.value as { scope?: string; version?: number } | undefined;
    // Another account or space, or an older layout: nothing of it is shown.
    if (!meta || meta.scope !== next || meta.version !== version) {
      await backend.clear().catch(() => undefined);
      await backend.put([{ key: META_KEY, value: { scope: next, version }, at: now(), size: 0 }]).catch(() => undefined);
      if (scope === next) loaded = next;
      return;
    }
    for (const r of all) {
      if (r.key === META_KEY || rows.has(r.key)) continue;
      rows.set(r.key, r);
      bytes += r.size;
    }
    loaded = next;
    const gone = evict();
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
      bytes = 0;
      opened = load(next);
      return opened;
    },
    scope: () => scope,
    /** True once the open space's rows are readable. */
    ready: () => scope !== null && loaded === scope,
    get<T>(key: string): T | undefined {
      const r = rows.get(key);
      if (!r) return undefined;
      r.at = now();
      return r.value as T;
    },
    /** Keeps `value` (JSON-able) under `key`; refused when no space is open, too large or carrying a secret. */
    set(key: string, raw: unknown): boolean {
      if (!scope || key === META_KEY) return false;
      let size: number;
      const value = scrubSigned(raw);
      try {
        size = JSON.stringify(value).length * 2;
      } catch {
        return false;
      }
      if (size > maxBytes / 2 || carriesSecret(value)) return false;
      drop(key);
      rows.set(key, { key, value, at: now(), size });
      bytes += size;
      dirty.add(key);
      const gone = evict();
      if (gone.length) void backend.delete(gone).catch(() => undefined);
      schedule();
      return true;
    },
    remove(key: string): void {
      drop(key);
      dirty.delete(key);
      void backend.delete([key]).catch(() => undefined);
    },
    /** Signing out: nothing is left on the device. */
    async wipe(): Promise<void> {
      scope = null;
      loaded = null;
      rows.clear();
      dirty.clear();
      bytes = 0;
      opened = Promise.resolve();
      await backend.clear().catch(() => undefined);
    },
    keys: () => [...rows.keys()],
    bytes: () => bytes,
    flush,
  };
}

export type DeviceCache = ReturnType<typeof createDeviceCache>;

/** A Map in place of IndexedDB (tests, or a browser without it). */
export function memoryBackend(seed: CacheRow[] = []): CacheBackend & { rows: Map<string, CacheRow> } {
  const m = new Map(seed.map((r) => [r.key, r]));
  return {
    rows: m,
    getAll: async () => [...m.values()].map((r) => ({ ...r })),
    put: async (rs) => void rs.forEach((r) => m.set(r.key, { ...r })),
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
