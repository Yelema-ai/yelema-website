// A route an older peer may not have yet (a null answer, or a failure `absent` recognises): once it says
// so, it is not asked again for `ttlMs` and answers null meanwhile. No imports: tested.
export function optionalRoute<A extends unknown[], T>(
  call: (...args: A) => Promise<T | null>,
  { absent = () => false, ttlMs = 10 * 60_000, now = Date.now }: { absent?: (e: unknown) => boolean; ttlMs?: number; now?: () => number } = {}
): (...args: A) => Promise<T | null> {
  let until = 0;
  return async (...args) => {
    if (now() < until) return null;
    try {
      const v = await call(...args);
      if (v === null) until = now() + ttlMs;
      return v;
    } catch (e) {
      if (!absent(e)) throw e;
      until = now() + ttlMs;
      return null;
    }
  };
}
