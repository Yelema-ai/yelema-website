// What a text written by a model or by another person may make the browser load or open. Pure: tested.
// A remote picture is a request sent the moment the text is shown, its address chosen by whoever wrote the text:
// only our own pictures are shown, any other becomes a link the reader may choose to open.

/** A picture this page serves itself, or one that is already in the page (data, blob). */
export function ownImage(src: unknown): src is string {
  if (typeof src !== "string") return false;
  return /^\/(?![/\\])/.test(src) || /^data:image\/(?:png|jpe?g|gif|webp|avif);/i.test(src) || src.startsWith("blob:");
}

/** `url` when it is a web address or a path of this site; undefined for any other scheme (`javascript:`, `data:`…). */
export function safeHref(url: string | null | undefined): string | undefined {
  const u = url?.trim();
  if (!u || /[\u0000-\u001f\\]/.test(u)) return undefined;
  return /^https?:\/\/[^/\s]/i.test(u) || /^\/(?!\/)/.test(u) ? u : undefined;
}

/** `url` when it is an https page without credentials in it; null otherwise. What a provider hands us to open in a tab. */
export function httpsUrl(url: unknown): string | null {
  if (typeof url !== "string" || !/^https:\/\//i.test(url.trim())) return null;
  try {
    const u = new URL(url.trim());
    return u.protocol === "https:" && !u.username && !u.password ? u.href : null;
  } catch {
    return null;
  }
}

interface Node { type: string; tagName?: string; properties?: Record<string, unknown>; children?: Node[]; value?: string }

/** rehype plugin: every `<img>` that is not ours becomes a link to it (or its alt text when the address is no web address). */
export function externalImagesAsLinks() {
  const walk = (node: Node): void => {
    node.children?.forEach((child, i, all) => {
      if (child.type === "element" && child.tagName === "img" && !ownImage(child.properties?.src)) {
        const href = safeHref(typeof child.properties?.src === "string" ? child.properties.src : null);
        const text: Node = { type: "text", value: String(child.properties?.alt || (href ? href.replace(/^https?:\/\//i, "").split(/[/?#]/)[0] : "") || "image") };
        all[i] = href?.startsWith("http") ? { type: "element", tagName: "a", properties: { href }, children: [text] } : text;
      } else walk(child);
    });
  };
  return (tree: Node): void => walk(tree);
}

// What the allow-list of rehype-sanitize (GitHub's, as Streamdown ships it) lets through that a chat has no use
// for: `<picture><source srcset>` loads a remote address like an image does; form fields' attributes; schemes that
// open another program. Everything not listed there is already dropped (script, iframe, form, style, on*, srcdoc).
const NO_TAGS = ["picture", "source"];
const NO_ATTRIBUTES = ["accept", "acceptCharset", "accessKey", "action", "encType", "htmlFor", "isMap", "longDesc", "maxLength", "media", "method", "multiple", "name", "noHref", "prompt", "readOnly", "selected", "srcSet", "tabIndex", "useMap", "value"];
const LINK_SCHEMES = ["http", "https", "mailto", "tel"];

type Attribute = string | [string, ...unknown[]];
export interface SanitizeSchema { tagNames?: readonly string[] | null; attributes?: Record<string, readonly Attribute[]> | null; protocols?: Record<string, readonly string[]> | null; [key: string]: unknown }

/** `base` narrowed: an allow-list only ever loses entries here. */
export function strictSchema<T extends SanitizeSchema>(base: T): T {
  const nameOf = (a: Attribute) => (typeof a === "string" ? a : a[0]);
  const attributes = Object.fromEntries(
    Object.entries(base.attributes ?? {})
      .filter(([tag]) => !NO_TAGS.includes(tag))
      .map(([tag, list]) => [tag, list.filter((a) => !NO_ATTRIBUTES.includes(nameOf(a)))])
  );
  return {
    ...base,
    tagNames: (base.tagNames ?? []).filter((t) => !NO_TAGS.includes(t)),
    attributes,
    protocols: { ...base.protocols, href: (base.protocols?.href ?? []).filter((p) => LINK_SCHEMES.includes(p)) },
  };
}

// The only pages a text may open without asking: a file of the drive, an Expert's pages, Livrables.
const OWN_PATHS = /^\/(?:api\/agents\/[^/]+\/files\/content|experts(?:\/|$)|livrables(?:\/|$))/;
// What a page of ours acts on when it finds it in its address (lib/chat-handoff.ts, ChatView).
const ACTION_PARAMS = ["q", "n", "ref", "dire"];

/**
 * A link of ours opens at once; anything else asks first: another site (`//host`, `/\host`, a tab or a line
 * break the browser drops), a page outside the list above once dot segments are resolved, or an address that
 * hands a page something to do.
 */
export function ownLink(url: string): boolean {
  if (!/^\/(?![/\\])/.test(url) || /[\u0000-\u0020\\]/.test(url)) return false;
  try {
    const u = new URL(url, "https://own.invalid");
    return u.origin === "https://own.invalid" && OWN_PATHS.test(u.pathname) && !ACTION_PARAMS.some((p) => u.searchParams.has(p));
  } catch {
    return false;
  }
}
