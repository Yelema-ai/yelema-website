// A first screen read with the page on the server, handed to its client view as `initial`. Shared by
// the server pages and the views' hooks; no imports: tested.

/** One space of the member: their own instance (`profileId` null) or an Expert's. */
export const spaceKey = (agentId: string, profileId: string | null): string => `${agentId}:${profileId ?? ""}`;

/** How long a server read for a first screen (page, bootstrap, expert screen) waits; past it, the browser reads. */
export const FIRST_SCREEN_BUDGET_MS = 2_500;
/** How long the browser waits for that reading to stream in; past it (a stalled stream), it reads itself. */
export const STREAM_GUARD_MS = 8_000;

/** `promise`'s value, or null when it fails or takes longer than `ms` (the browser then reads it itself). */
export function within<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((resolve) => (timer = setTimeout(() => resolve(null), ms)));
  return Promise.race([promise.catch(() => null), late]).finally(() => clearTimeout(timer));
}

/** `within` against one deadline `ms` from now: reads started later get only what is left of it. */
export function byDeadline(ms: number, now: () => number = Date.now): <T>(promise: Promise<T>) => Promise<T | null> {
  const end = now() + ms;
  return (promise) => within(promise, Math.max(0, end - now()));
}

/** Each key's answer; a key that failed is left out, so the view treats it as its own failed read. */
export async function settledByKey<T>(keys: string[], load: (key: string) => Promise<T>): Promise<Record<string, T>> {
  const all = await Promise.allSettled(keys.map(load));
  return Object.fromEntries(keys.flatMap((k, i) => (all[i].status === "fulfilled" ? [[k, (all[i] as PromiseFulfilledResult<T>).value]] : [])));
}
