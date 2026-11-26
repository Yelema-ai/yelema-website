import { hydrate, persistTo } from "@/lib/client-cache";
import { eraseKeys } from "@/lib/buzz-key-store";
import { eraseMetadata } from "@/lib/device-metadata";
import { accountHash, createDeviceCache, flushOnHide, memoryBackend, pickBackend } from "@/lib/device-cache";
import { idbBackend } from "@/lib/device-cache-idb";

// The browser's device cache (lib/device-cache). Its rows start loading as the page's JS runs, but
// nothing reaches a screen before WorkspaceProvider confirms the account and space they belong to.
export const CACHE_VERSION = 1;
// Read whole when the page opens: kept small so that read stays short.
const MAX_BYTES = 2 * 1024 * 1024;
const SCOPE_KEY = "yelema-cache-scope";
// Set before a wipe starts, removed once it is done: a tab closed in between finishes it at the next page.
const WIPE_KEY = "yelema-cache-wipe";
// Only these client-cache answers are kept on the device; the rest live for the tab only.
const KEPT = ["chat:", "drive-tree:", "drive-files:", "all-deliverables:", "conversations:", "models:", "experts:", "buzz:", "expert-tools:"];
// A thread keeps its latest messages, without the model's reasoning.
const THREAD_TAIL = 40;

const browser = typeof window !== "undefined";
const disk = browser && typeof indexedDB !== "undefined" ? idbBackend() : null;
const memory = memoryBackend();
// False for a sensitive deployment (DEVICE_CACHE=memory): rows live for the tab only, nothing is written to the device.
let persists = true;
const cache = createDeviceCache(pickBackend(() => (persists && disk) || memory), { version: CACHE_VERSION, maxBytes: MAX_BYTES });
let wiping: Promise<void> | null = null;
const openers: ((get: (key: string) => unknown, keys: string[]) => void)[] = [];
let confirmed: string | null = null;
let filled: string | null = null;
// Every tab of the app on this device: one that opens another account or space, or wipes, closes the others'.
const tabs = browser && typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("yelema-device-cache") : null;
const tell = (scope: string | null) => tabs?.postMessage({ scope });

function storage(fn: (s: Storage) => string | null | void): string | null {
  try {
    return (fn(localStorage) as string | null | undefined) ?? null;
  } catch {
    return null;
  }
}

const shape = (key: string, value: unknown): unknown =>
  key.startsWith("chat:") && Array.isArray(value) ? value.slice(-THREAD_TAIL).map((m: Record<string, unknown>) => ({ ...m, thinking: undefined })) : value;

/** Keeps `value` on the device under `key`, once the account and space are confirmed. */
export function deviceKeep(key: string, value: unknown): void {
  if (confirmed && cache.scope() === confirmed) cache.set(key, shape(key, value));
}

/** Registers what fills a store from the device's rows, run once per confirmed account and space. */
export function onDeviceOpen(fn: (get: (key: string) => unknown, keys: string[]) => void): void {
  openers.push(fn);
  if (filled && filled === confirmed) fn((k) => cache.get(k), cache.keys());
}

function fill(scope: string): void {
  if (confirmed !== scope) return;
  filled = scope;
  const keys = cache.keys();
  for (const k of keys) if (KEPT.some((p) => k.startsWith(p))) hydrate(k, cache.get(k));
  for (const fn of openers) fn((k) => cache.get(k), keys);
}

/** The confirmed account and space (what the messaging key is bound to); null before `confirmDevice`. */
export const deviceAccount = (): string | null => confirmed;
/** False when nothing may rest on this device: what must survive a reload goes to the tab's own storage. */
export const devicePersists = (): boolean => persists;

/**
 * The signed-in account and its space: their rows fill the stores (synchronously when already loaded).
 * `memoryOnly`: nothing is written to the device, and what an earlier version left there is cleared.
 */
export function confirmDevice(email: string, workspaceId: string, memoryOnly = false): void {
  if (!browser || !email || !workspaceId) return;
  const scope = `${accountHash(email.toLowerCase())}:${workspaceId}`;
  if (confirmed === scope) return;
  if (memoryOnly && persists) {
    persists = false;
    cache.close();
    storage((s) => s.removeItem(SCOPE_KEY));
    eraseKeys(local());
    void disk?.clear().catch(() => undefined);
  }
  confirmed = scope;
  if (persists) storage((s) => s.setItem(SCOPE_KEY, scope));
  tell(scope);
  const loading = wiping ? wiping.then(() => cache.open(scope)) : cache.open(scope);
  if (cache.ready()) fill(scope);
  else void loading.then(() => fill(scope));
}

const local = (): Storage | null => {
  try {
    return localStorage;
  } catch {
    return null;
  }
};
const session = (): Storage | null => {
  try {
    return sessionStorage;
  } catch {
    return null;
  }
};

/**
 * Signing out, the sign-in page or an expired session (lib/api): nothing of the account stays on the device.
 * What is synchronous goes first (the messaging key, the scope); the rows follow, and a wipe cut short by the
 * page leaving is finished by the next page before it reads anything.
 */
export function wipeDevice(): Promise<void> {
  confirmed = null;
  filled = null;
  storage((s) => s.setItem(WIPE_KEY, "1"));
  storage((s) => s.removeItem(SCOPE_KEY));
  eraseKeys(local(), session());
  eraseMetadata(local(), session());
  tell(null);
  const done = (wiping = Promise.all([cache.wipe(), persists ? undefined : disk?.clear().catch(() => undefined)]).then(() => {
    storage((s) => s.removeItem(WIPE_KEY));
    if (wiping === done) wiping = null;
  }));
  return done;
}

function closeDevice(): void {
  confirmed = null;
  filled = null;
  cache.close();
}

if (browser) {
  persistTo((key, value) => KEPT.some((p) => key.startsWith(p)) && deviceKeep(key, value));
  flushOnHide(cache, window, () => document.visibilityState === "hidden");
  // Read ahead after the first paint, when idle; the shell's confirmDevice opens it at once if it comes first.
  const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  const ahead = () => {
    const last = storage((s) => s.getItem(SCOPE_KEY));
    if (last && !cache.scope() && !wiping) void cache.open(last);
  };
  // A wipe the last page did not finish: done now, before any row is read.
  if (storage((s) => s.getItem(WIPE_KEY))) void wipeDevice();
  else if (storage((s) => s.getItem(SCOPE_KEY))) requestAnimationFrame(() => (ric ? ric(ahead, { timeout: 500 }) : setTimeout(ahead, 0)));
  tabs?.addEventListener("message", (e: MessageEvent<{ scope?: string | null }>) => {
    if (e.data?.scope !== confirmed && e.data?.scope !== cache.scope()) closeDevice();
  });
}
