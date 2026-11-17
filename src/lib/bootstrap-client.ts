import type { DriveTree } from "./drive-paths.ts";
import type { MemberPrefs } from "./backoffice.ts";
import type { SpaceData } from "./sessions-store.ts";
import { within } from "./first-screen.ts";

// The tab's one first read (`GET /api/bootstrap`), started by whoever asks first. Its readers wait for it
// WAIT_MS at most, then read what it left out themselves. A failure is asked again by the next caller; a
// 404 (an older deployment) is not asked again for a while; a switch of workspace starts it afresh.
export interface Bootstrap {
  agentId: string | null;
  preferences: MemberPrefs | null;
  deploy: { version: string; maintenance: boolean } | null;
  spaces: Record<string, SpaceData> | null;
  tree: DriveTree | null;
}

export const WAIT_MS = 3_000;
export const ABSENT_MS = 5 * 60_000;

export function createBootstrap(load: () => Promise<Response>, now: () => number = Date.now) {
  const seeders: ((b: Bootstrap) => void)[] = [];
  let started: Promise<Bootstrap | null> | null = null;
  let answered = false;
  let own: string | null | undefined;
  let absentUntil = 0;
  let round = 0;

  function start(): Promise<Bootstrap | null> {
    const mine = ++round;
    return load()
      .then((res) => (res.ok ? (res.json() as Promise<Bootstrap>) : (res.status === 404 && (absentUntil = now() + ABSENT_MS), null)))
      .catch(() => null)
      .then((b) => {
        if (mine !== round) return null;
        answered = true;
        if (!b) started = null;
        else {
          own = b.agentId;
          for (const fn of seeders) fn(b);
        }
        return b;
      });
  }

  return {
    /** Registers what fills a client store from the bootstrap (sessions, drive), before any reader asks. */
    onBootstrap(fn: (b: Bootstrap) => void): void {
      seeders.push(fn);
    },
    /** The bootstrap, or null when it failed or is late (WAIT_MS). Never rejects. */
    bootstrap(): Promise<Bootstrap | null> {
      if (!started && now() < absentUntil) return Promise.resolve(null);
      started ??= start();
      return within(started, WAIT_MS);
    },
    /** Resolves once the bootstrap seeded the stores: at once when it already answered or `agentId` is not its own. */
    bootstrapped(agentId?: string): Promise<void> {
      if (answered || (agentId && own !== undefined && agentId !== own)) return Promise.resolve();
      return this.bootstrap().then(() => undefined);
    },
    /** The shell knows the own instance before the bootstrap answers: readers of another one do not wait. */
    ownedBy(agentId: string | null): void {
      if (agentId) own ??= agentId;
    },
    /** Another workspace: its first read is the bootstrap's again. */
    reset(): void {
      round++;
      started = null;
      answered = false;
      own = undefined;
    },
  };
}

const tab = createBootstrap(() => fetch("/api/bootstrap", { headers: { Accept: "application/json" } }));
const server = typeof window === "undefined";
export const onBootstrap = tab.onBootstrap;
export const bootstrap = () => (server ? Promise.resolve(null) : tab.bootstrap());
export const bootstrapped = (agentId?: string) => (server ? Promise.resolve() : tab.bootstrapped(agentId));
export const resetBootstrap = () => tab.reset();
export const bootstrapOwner = (agentId: string | null) => tab.ownedBy(agentId);
