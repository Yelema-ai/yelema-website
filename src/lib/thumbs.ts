// Reduced copies of the drive's pictures for previews: the full file can weigh 8 MB, a preview a few
// dozen KB. Pure: widths, which files qualify, and the bounded cache the thumb route keeps them in.

export const THUMB_WIDTHS = [480, 960, 1600] as const;
export type ThumbWidth = (typeof THUMB_WIDTHS)[number];

const THUMBABLE = /\.(png|jpe?g|webp|gif|bmp|avif|tiff?)$/i;

export function isThumbable(path: string): boolean {
  return THUMBABLE.test(path);
}

const ascii = (b: Uint8Array, at: number, text: string): boolean => [...text].every((c, i) => b[at + i] === c.charCodeAt(0));

/** Whether the bytes begin as one of the picture formats above: a file is decoded for what it is, not for its name. */
export function looksLikeImage(b: Uint8Array): boolean {
  if (b.byteLength < 12) return false;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return true;
  if (b[0] === 0x89 && ascii(b, 1, "PNG\r\n")) return true;
  if (ascii(b, 0, "GIF87a") || ascii(b, 0, "GIF89a") || ascii(b, 0, "BM")) return true;
  if (ascii(b, 0, "RIFF") && ascii(b, 8, "WEBP")) return true;
  if (ascii(b, 4, "ftyp") && (ascii(b, 8, "avif") || ascii(b, 8, "avis") || ascii(b, 8, "mif1"))) return true;
  return (ascii(b, 0, "II") && b[2] === 0x2a && b[3] === 0) || (ascii(b, 0, "MM") && b[2] === 0 && b[3] === 0x2a);
}

/** At most `max` tasks at once, the others wait their turn: a grid of previews must not decode them all together. */
export function atMost(max: number) {
  let running = 0;
  const waiting: (() => void)[] = [];
  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (running >= max) await new Promise<void>((go) => waiting.push(go));
    running++;
    try {
      return await task();
    } finally {
      running--;
      waiting.shift()?.();
    }
  };
}

/** The smallest allowed width at least `raw` wide; a free width would let anyone fill the cache. */
export function thumbWidth(raw: string | null): ThumbWidth {
  const n = Number(raw);
  return THUMB_WIDTHS.find((w) => Number.isFinite(n) && w >= n) ?? THUMB_WIDTHS[THUMB_WIDTHS.length - 1];
}

/** Kept by total size and age; the same key asked twice at once is made once. */
export function boundedCache<T extends { byteLength: number }>(maxBytes: number, ttlMs: number, now: () => number = Date.now) {
  const store = new Map<string, { at: number; value: T }>();
  const flying = new Map<string, Promise<T>>();
  let bytes = 0;
  const drop = (key: string) => {
    const hit = store.get(key);
    if (hit) bytes -= hit.value.byteLength;
    store.delete(key);
  };
  return {
    get size() {
      return bytes;
    },
    async get(key: string, make: () => Promise<T>): Promise<T> {
      const hit = store.get(key);
      if (hit && now() - hit.at < ttlMs) {
        store.delete(key);
        store.set(key, hit);
        return hit.value;
      }
      drop(key);
      let pending = flying.get(key);
      if (!pending) {
        pending = make()
          .then((value) => {
            if (value.byteLength <= maxBytes) {
              store.set(key, { at: now(), value });
              bytes += value.byteLength;
              for (const k of store.keys()) {
                if (bytes <= maxBytes) break;
                drop(k);
              }
            }
            return value;
          })
          .finally(() => flying.delete(key));
        flying.set(key, pending);
      }
      return pending;
    },
  };
}
