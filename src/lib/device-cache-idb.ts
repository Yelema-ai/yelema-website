import { META_KEY, sameMeta, type CacheBackend, type CacheRow, type Meta } from "./device-cache.ts";

// IndexedDB under lib/device-cache: one object store, rows keyed by `key`. A browser that refuses
// IndexedDB (private window, quota) answers empty and keeps nothing.
const DB = "yelema-cache";
const STORE = "rows";

function done<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function idbBackend(): CacheBackend {
  let db: Promise<IDBDatabase> | null = null;
  const open = () =>
    (db ??= new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "key" });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }).catch((e: unknown) => {
      db = null;
      throw e;
    }));
  // False when `fn` refused (aborted the transaction on purpose).
  async function tx(mode: IDBTransactionMode, fn: (s: IDBObjectStore, refuse: () => void) => void): Promise<boolean> {
    const t = (await open()).transaction(STORE, mode);
    let refused = false;
    fn(t.objectStore(STORE), () => {
      refused = true;
      t.abort();
    });
    return new Promise<boolean>((resolve, reject) => {
      t.oncomplete = () => resolve(true);
      t.onerror = t.onabort = () => (refused ? resolve(false) : reject(t.error));
    });
  }
  // The meta is read in the write's own transaction: no other tab can change it in between.
  const putRows = (s: IDBObjectStore, rows: CacheRow[], meta: Meta | undefined, refuse: () => void) => {
    if (!meta) return rows.forEach((r) => s.put(r));
    const req = s.get(META_KEY);
    req.onsuccess = () => (sameMeta((req.result as CacheRow | undefined)?.value, meta) ? rows.forEach((r) => s.put(r)) : refuse());
  };
  return {
    getAll: async () => done((await open()).transaction(STORE, "readonly").objectStore(STORE).getAll() as IDBRequest<CacheRow[]>),
    put: (rows, meta) => tx("readwrite", (s, refuse) => putRows(s, rows, meta, refuse)),
    delete: (keys) => tx("readwrite", (s) => keys.forEach((k) => s.delete(k))).then(() => undefined),
    clear: () => tx("readwrite", (s) => s.clear()).then(() => undefined),
  };
}
