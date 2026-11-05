import type { DriveTree } from "@/lib/drive-paths";
import type { MemberPrefs } from "@/lib/backoffice";
import type { SpaceData } from "@/lib/sessions-store";

// The tab's one first read (`GET /api/bootstrap`), started by whoever asks first and never repeated.
// The shell's readers wait for it a moment, then read what it left out themselves; a 404 or an error
// means the old reads, one by one.
export interface Bootstrap {
  agentId: string | null;
  preferences: MemberPrefs | null;
  deploy: { version: string; maintenance: boolean } | null;
  spaces: Record<string, SpaceData> | null;
  tree: DriveTree | null;
}

// Past this the readers stop waiting: the slow part is theirs to ask.
const WAIT_MS = 3_000;
let started: Promise<Bootstrap | null> | null = null;
let seeded: Promise<void> | null = null;
const seeders: ((b: Bootstrap) => void)[] = [];

/** Registers what fills a client store from the bootstrap (sessions, drive), before any reader asks. */
export function onBootstrap(fn: (b: Bootstrap) => void): void {
  seeders.push(fn);
}

export function bootstrap(): Promise<Bootstrap | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  started ??= fetch("/api/bootstrap", { headers: { Accept: "application/json" } })
    .then((res) => (res.ok ? (res.json() as Promise<Bootstrap>) : null))
    .catch(() => null);
  return started;
}

/** Resolves once the bootstrap filled the stores, or after WAIT_MS: never rejects. */
export function bootstrapped(): Promise<void> {
  seeded ??= bootstrap().then((b) => {
    if (b) for (const fn of seeders) fn(b);
  });
  return Promise.race([seeded, new Promise<void>((r) => setTimeout(r, WAIT_MS))]);
}
