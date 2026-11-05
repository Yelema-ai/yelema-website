import "server-only";
import { hexToBytes } from "nostr-tools/utils";
import { BuzzConnection } from "@/lib/buzz-relay";

// This server's connections to a client's relay on behalf of a guest (NIP-42 AUTH signed with the guest's key,
// as a member's browser does). One per stream; reads and posts share one per guest, closed after 60 s idle.

const IDLE_MS = 60_000;
const pool = new Map<string, { ready: Promise<BuzzConnection>; idle?: ReturnType<typeof setTimeout> }>();

function relayUrl(url: string): string {
  const u = new URL(url);
  if (u.protocol !== "wss:" && u.protocol !== "ws:") throw new Error("relay address");
  return url;
}

/** A fresh, authenticated connection (the caller closes it). */
export async function openRelay(url: string, secret: string): Promise<BuzzConnection> {
  const c = new BuzzConnection(relayUrl(url), hexToBytes(secret));
  try {
    await c.connect();
    return c;
  } catch (e) {
    c.close();
    throw e;
  }
}

/** The guest's shared connection, opened on first use and again after a drop. */
export function pooledRelay(tag: string, url: string, secret: string): Promise<BuzzConnection> {
  const key = `${tag}\n${url}`;
  let entry = pool.get(key);
  if (!entry) {
    const c = new BuzzConnection(relayUrl(url), hexToBytes(secret));
    c.onclose = () => pool.get(key)?.ready === ready && pool.delete(key);
    const ready = c.connect().then(() => c);
    ready.catch(() => (pool.get(key)?.ready === ready && pool.delete(key), c.close()));
    entry = { ready };
    pool.set(key, entry);
  }
  const e = entry;
  clearTimeout(e.idle);
  e.idle = setTimeout(() => {
    if (pool.get(key) === e) pool.delete(key);
    void e.ready.then((c) => c.close()).catch(() => undefined);
  }, IDLE_MS);
  e.idle.unref?.();
  return e.ready;
}
