// A dashboard page left in the drive often points to files beside it (`tdb.css`, `img/logo.png`,
// fonts in its stylesheet). Framed under a strict CSP from another address, none of them load and
// the page shows unstyled with broken images (Leslie, 01/11). They are read from the drive and put
// inside the page: stylesheets as <style>, pictures and fonts as data: addresses.
// Pure: the reading is the caller's (`read`), so this file is tested without an instance.

/** The drive path of `ref` seen from the folder of `from`, or null when it is not a local file. */
export function resolveBeside(from: string, ref: string): string | null {
  const clean = ref.trim().split(/[?#]/)[0];
  if (!clean || /^(?:[a-z][a-z0-9+.-]*:|\/\/|\/|#)/i.test(clean)) return null;
  const parts = from.split("/").slice(0, -1);
  for (const seg of decodeURIComponent(clean).split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (parts.length <= 1) return null;
      parts.pop();
    } else parts.push(seg);
  }
  return parts.join("/");
}

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  avif: "image/avif",
  ico: "image/x-icon",
  woff2: "font/woff2",
  woff: "font/woff",
  ttf: "font/ttf",
  otf: "font/otf",
};

export const mimeOf = (path: string): string | null => MIME[path.split(".").pop()?.toLowerCase() ?? ""] ?? null;

export type ReadFile = (path: string) => Promise<Uint8Array | null>;

/** At most this many files, this much each and this much in all: a page, not a drive. */
export const INLINE_LIMITS = { files: 40, each: 3 * 1024 * 1024, total: 10 * 1024 * 1024 };

const toBase64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");

export async function inlineDashboard(html: string, htmlPath: string, read: ReadFile): Promise<string> {
  let files = 0;
  let total = 0;
  const cache = new Map<string, Promise<Uint8Array | null>>();
  const take = (path: string): Promise<Uint8Array | null> => {
    if (!cache.has(path)) {
      cache.set(
        path,
        (async () => {
          if (files >= INLINE_LIMITS.files || total >= INLINE_LIMITS.total) return null;
          files += 1;
          const bytes = await read(path).catch(() => null);
          if (!bytes || bytes.length > INLINE_LIMITS.each || total + bytes.length > INLINE_LIMITS.total) return null;
          total += bytes.length;
          return bytes;
        })()
      );
    }
    return cache.get(path)!;
  };
  const dataUrl = async (from: string, ref: string): Promise<string | null> => {
    const path = resolveBeside(from, ref);
    const mime = path && mimeOf(path);
    if (!path || !mime) return null;
    const bytes = await take(path);
    return bytes ? `data:${mime};base64,${toBase64(bytes)}` : null;
  };
  const replaceAsync = async (text: string, re: RegExp, fn: (m: RegExpExecArray) => Promise<string>) => {
    const out: string[] = [];
    let last = 0;
    for (const m of text.matchAll(re)) {
      out.push(text.slice(last, m.index), await fn(m as RegExpExecArray));
      last = (m.index ?? 0) + m[0].length;
    }
    out.push(text.slice(last));
    return out.join("");
  };
  // url(...) in a stylesheet, seen from that stylesheet's own folder.
  const inlineCss = (css: string, from: string) =>
    replaceAsync(css, /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, async (m) => {
      const data = await dataUrl(from, m[2]);
      return data ? `url("${data}")` : m[0];
    });

  // <link rel="stylesheet" href="local.css"> becomes the stylesheet itself.
  let page = await replaceAsync(html, /<link\b[^>]*>/gi, async (m) => {
    const tag = m[0];
    if (!/\brel\s*=\s*["']?stylesheet/i.test(tag)) return tag;
    const href = tag.match(/\bhref\s*=\s*(["'])(.*?)\1/i)?.[2];
    const path = href ? resolveBeside(htmlPath, href) : null;
    if (!path || !path.toLowerCase().endsWith(".css")) return tag;
    const bytes = await take(path);
    if (!bytes) return tag;
    const css = await inlineCss(new TextDecoder().decode(bytes), path);
    return `<style>${css.replace(/<\/style/gi, "<\\/style")}</style>`;
  });
  // Pictures: src of <img>, <source>, <image> (svg) and inline styles' url(...).
  page = await replaceAsync(page, /(<(?:img|source|image|input)\b[^>]*?\b(?:src|href)\s*=\s*)(["'])(.*?)\2/gi, async (m) => {
    const data = await dataUrl(htmlPath, m[3]);
    return data ? `${m[1]}${m[2]}${data}${m[2]}` : m[0];
  });
  page = await replaceAsync(page, /<style\b[^>]*>([\s\S]*?)<\/style>/gi, async (m) => {
    if (!/url\(/i.test(m[1])) return m[0];
    const css = await inlineCss(m[1], htmlPath);
    return m[0].replace(m[1], () => css);
  });
  return page;
}
