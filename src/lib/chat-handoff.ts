// A message one of our own screens hands to the chat (« Demander à mon équipe », the home's chat bar). The text
// rides the address as `?q=`; it is sent without a click only when `?n=` names the one-time note this tab left in
// its own storage for that very text. Any other `?q=` (a link from an e-mail, a room, a reply) only fills the field.
// The home's chat bar leaves no `?q=`: its note names the chat's path (`handoffNote`), so the address stays the bare
// chat route its prefetch already holds — one round trip less before the first reply.

const KEY = "yelema.q";

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function tabStore(): Store | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

/** The query (`q=…&n=…`) that makes the chat send `text` at once. Without storage, `q` alone: the field is filled. */
export function handoffQuery(text: string, store: Store | null = tabStore()): string {
  const q = `q=${encodeURIComponent(text)}`;
  try {
    if (!store) return q;
    const nonce = crypto.randomUUID();
    store.setItem(KEY, JSON.stringify({ nonce, text }));
    return `${q}&n=${nonce}`;
  } catch {
    return q;
  }
}

/** How long a note without `?q=` waits for its chat to open; older, it is dropped unsent. */
export const NOTE_MS = 30_000;

/** Leaves `text` for the chat at `path` to send once it opens, with no `?q=`; false without storage (use `handoffQuery`). */
export function handoffNote(text: string, path: string, store: Store | null = tabStore(), now = Date.now()): boolean {
  try {
    if (!store) return false;
    store.setItem(KEY, JSON.stringify({ text, path, at: now }));
    return true;
  } catch {
    return false;
  }
}

export interface Handoff { text: string; send: boolean }

/** What the address asks of the chat: the text, and whether this tab vouches for it. The note is spent on reading. */
export function readHandoff(search: string, store: Store | null = tabStore(), pathname?: string, now = Date.now()): Handoff | null {
  const params = new URLSearchParams(search);
  const text = params.get("q");
  if (!text) return pathname ? readNote(pathname, store, now) : null;
  const nonce = params.get("n");
  if (!nonce || !store) return { text, send: false };
  try {
    const raw = store.getItem(KEY);
    if (!raw) return { text, send: false };
    const note = JSON.parse(raw) as { nonce?: unknown; text?: unknown };
    if (note.nonce !== nonce) return { text, send: false };
    store.removeItem(KEY);
    return { text, send: note.text === text };
  } catch {
    return { text, send: false };
  }
}

/** The home's note for this very chat path, young enough: sent, and spent. Any other path or age leaves nothing. */
function readNote(pathname: string, store: Store | null, now: number): Handoff | null {
  try {
    const raw = store?.getItem(KEY);
    if (!raw) return null;
    const note = JSON.parse(raw) as { text?: unknown; path?: unknown; at?: unknown };
    if (typeof note.path !== "string" || typeof note.text !== "string" || typeof note.at !== "number") return null;
    if (now - note.at > NOTE_MS) return void store?.removeItem(KEY), null;
    if (note.path !== pathname || !note.text.trim()) return null;
    store?.removeItem(KEY);
    return { text: note.text, send: true };
  } catch {
    return null;
  }
}
