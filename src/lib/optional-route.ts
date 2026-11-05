// A route an older peer may not have yet (a null answer, or a failure `absent` recognises): once it says
// so, it is not asked again for `ttlMs` and answers null meanwhile. `key`: remembered per peer (an
// instance's gateway), else for every call. No imports: tested.
const MAX_KEYS = 1_000;

export function optionalRoute<A extends unknown[], T>(
  call: (...args: A) => Promise<T | null>,
  {
    absent = () => false,
    ttlMs = 10 * 60_000,
    now = Date.now,
    key = () => "",
  }: { absent?: (e: unknown) => boolean; ttlMs?: number; now?: () => number; key?: (...args: A) => string } = {}
): (...args: A) => Promise<T | null> {
  const until = new Map<string, number>();
  const mark = (k: string) => {
    until.delete(k);
    if (until.size >= MAX_KEYS) until.delete(until.keys().next().value!);
    until.set(k, now() + ttlMs);
  };
  return async (...args) => {
    const k = key(...args);
    const u = until.get(k);
    if (u !== undefined) {
      if (now() < u) return null;
      until.delete(k);
    }
    try {
      const v = await call(...args);
      if (v === null) mark(k);
      return v;
    } catch (e) {
      if (!absent(e)) throw e;
      mark(k);
      return null;
    }
  };
}
