// A message one of our own screens hands to the chat (« Demander à mon équipe », the home's chat bar). The text
// rides the address as `?q=`; it is sent without a click only when `?n=` names the one-time note this tab left in
// its own storage for that very text. Any other `?q=` (a link from an e-mail, a room, a reply) only fills the field.

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

export interface Handoff { text: string; send: boolean }

/** What the address asks of the chat: the text, and whether this tab vouches for it. The note is spent on reading. */
export function readHandoff(search: string, store: Store | null = tabStore()): Handoff | null {
  const params = new URLSearchParams(search);
  const text = params.get("q");
  if (!text) return null;
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
