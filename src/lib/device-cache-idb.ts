import type { CacheBackend, CacheRow } from "./device-cache.ts";

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
  async function tx(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => void): Promise<void> {
    const t = (await open()).transaction(STORE, mode);
    fn(t.objectStore(STORE));
    await new Promise<void>((resolve, reject) => {
      t.oncomplete = () => resolve();
      t.onerror = t.onabort = () => reject(t.error);
    });
  }
  return {
    getAll: async () => done((await open()).transaction(STORE, "readonly").objectStore(STORE).getAll() as IDBRequest<CacheRow[]>),
    put: (rows) => tx("readwrite", (s) => rows.forEach((r) => s.put(r))),
    delete: (keys) => tx("readwrite", (s) => keys.forEach((k) => s.delete(k))),
    clear: () => tx("readwrite", (s) => s.clear()),
  };
}
