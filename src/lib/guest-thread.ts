// A guest's salon thread, read and written by THIS server with the guest's key (the browser never reaches the
// relay). Every event is filtered here: the relay would also serve a member key's DMs, rosters and channels.
import type { Event, EventTemplate } from "nostr-tools/pure";
import { MESSAGE_KINDS, marked, relayRoot, sortMessages, toMessage, type BuzzConnection, type Message } from "./buzz-relay.ts";

export const MAX_TEXT = 8000;
export const HISTORY_LIMIT = 50;
const MAX_LIMIT = 100;
const EVENT_ID = /^[0-9a-f]{64}$/;

/** `nom`: the participant's name in this salon, null for a key it does not list. */
export type GuestMessage = Message & { nom: string | null };
type Relay = Pick<BuzzConnection, "query" | "sign" | "publishSigned">;
export type StreamRelay = Pick<BuzzConnection, "subscribe" | "close"> & { onclose: (() => void) | null };

/** A message of this salon only: one of the kinds members read, every `h` tag naming the salon. */
export function inSalon(e: Event, channel: string): boolean {
  if (!e || typeof e !== "object" || !MESSAGE_KINDS.includes(e.kind) || !Array.isArray(e.tags)) return false;
  const h = e.tags.filter((t) => t[0] === "h");
  return h.length > 0 && h.every((t) => t[1] === channel);
}

/** What the guest's page receives: mentions limited to the salon's keys, the author's name from its participants. */
export function toGuestMessage(e: Event, names: ReadonlyMap<string, string>): GuestMessage {
  const m = toMessage(e);
  return { ...m, mentions: m.mentions.filter((k) => names.has(k)), nom: names.get(m.author) ?? null };
}

export const historyFilter = (channel: string, before: number | null, limit: number) => ({
  kinds: MESSAGE_KINDS,
  "#h": [channel],
  limit: Math.min(Math.max(1, Math.floor(limit) || HISTORY_LIMIT), MAX_LIMIT),
  ...(before ? { until: before } : {}),
});

/**
 * The last messages (before `before`), oldest first, and the parents/roots they reply to that were not loaded,
 * fetched only within the salon.
 */
export async function guestHistory(relay: Pick<Relay, "query">, channel: string, names: ReadonlyMap<string, string>, before: number | null, limit = HISTORY_LIMIT) {
  const events = (await relay.query(historyFilter(channel, before, limit))).filter((e) => inSalon(e, channel));
  const have = new Set(events.map((e) => e.id));
  const missing = [...new Set(events.flatMap((e) => [marked(e, "reply"), marked(e, "root")]))].filter((id): id is string => Boolean(id && EVENT_ID.test(id) && !have.has(id)));
  const refs = missing.length ? (await relay.query({ ids: missing.slice(0, MAX_LIMIT), kinds: MESSAGE_KINDS, "#h": [channel] })).filter((e) => inSalon(e, channel)) : [];
  const out = (list: Event[]) => sortMessages(list.map((e) => toGuestMessage(e, names))) as GuestMessage[];
  return { messages: out(events), refs: out(refs) };
}

export class GuestPostError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** The text as sent: trimmed, not empty, at most MAX_TEXT characters. */
export function guestText(raw: unknown): string {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) throw new GuestPostError(422, "invalid_request", "Écrivez un message.");
  if (text.length > MAX_TEXT) throw new GuestPostError(422, "too_long", `Message trop long (${MAX_TEXT} caractères au plus).`);
  return text;
}

/** A salon message as members write it (kind 9, `h` = salon), NIP-10 root then reply when it answers one. No mention. */
export const guestTemplate = (channel: string, text: string, reply: { root: string; parent: string } | null, at = Math.floor(Date.now() / 1000)): EventTemplate => ({
  kind: 9,
  created_at: at,
  tags: [["h", channel], ...(reply ? [["e", reply.root, "", "root"], ["e", reply.parent, "", "reply"]] : [])],
  content: text,
});

/** Signs and publishes one message; a `replyTo` must be a message of this salon. */
export async function guestPost(relay: Relay, channel: string, names: ReadonlyMap<string, string>, raw: unknown, replyTo: unknown): Promise<GuestMessage> {
  const text = guestText(raw);
  let reply: { root: string; parent: string } | null = null;
  if (replyTo !== undefined && replyTo !== null) {
    const outside = new GuestPostError(422, "reply_outside", "Ce message n’est pas dans ce salon.");
    if (typeof replyTo !== "string" || !EVENT_ID.test(replyTo)) throw outside;
    const [parent] = (await relay.query({ ids: [replyTo], kinds: MESSAGE_KINDS, "#h": [channel] })).filter((e) => e.id === replyTo && inSalon(e, channel));
    if (!parent) throw outside;
    const root = marked(parent, "root") ?? (marked(parent, "reply") ? await relayRoot(relay, channel, parent.id) : parent.id);
    reply = { root, parent: parent.id };
  }
  const event = relay.sign(guestTemplate(channel, text, reply));
  const r = await relay.publishSigned(event);
  if (!r.ok) throw new GuestPostError(502, "refused", "Message non envoyé. Réessayez dans un instant.");
  return toGuestMessage(event, names);
}

export type Recheck = () => Promise<"ok" | "ended" | "signed_out">;

/** `Last-Event-ID` (or `?since=`) as a relay `since`, with slack for same-second events; within the last 7 days. */
export function sinceOf(raw: string | null, nowS: number): number {
  const v = Number(raw);
  if (!raw || !Number.isInteger(v)) return nowS;
  return Math.min(nowS, Math.max(nowS - 7 * 86_400, v - 10));
}

/**
 * New messages of the salon as server-sent events: `id` is the event time (the browser resumes from it),
 * a ping every `heartbeatMs`, the session checked every `recheckMs` (`end` then close when it is over),
 * closed after `maxMs` or when the relay drops (the browser reconnects).
 */
export function guestStream(o: { relay: StreamRelay; channel: string; names: ReadonlyMap<string, string>; since: number; recheck: Recheck; signal: AbortSignal; heartbeatMs?: number; recheckMs?: number; maxMs?: number }): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  let finish: (last?: string) => void = () => undefined;
  return new ReadableStream<Uint8Array>({
    start(ctrl) {
      let done = false;
      const write = (s: string) => {
        if (done) return;
        try {
          ctrl.enqueue(enc.encode(s));
        } catch {
          finish();
        }
      };
      const timers: ReturnType<typeof setTimeout>[] = [];
      let sub: { close: () => void } | null = null;
      finish = (last) => {
        if (done) return;
        if (last) write(last);
        done = true;
        for (const t of timers) (clearInterval(t), clearTimeout(t));
        sub?.close();
        o.relay.onclose = null;
        o.relay.close();
        try {
          ctrl.close();
        } catch {
          /* already closed */
        }
      };
      write("retry: 2000\n\n");
      o.relay.onclose = () => finish();
      sub = o.relay.subscribe({ kinds: MESSAGE_KINDS, "#h": [o.channel], since: o.since }, (e) => {
        if (inSalon(e, o.channel)) write(`id: ${e.created_at}\ndata: ${JSON.stringify(toGuestMessage(e, o.names))}\n\n`);
      }, { onError: () => finish() });
      timers.push(setInterval(() => write(`id: ${Math.floor(Date.now() / 1000)}\nevent: ping\ndata: 1\n\n`), o.heartbeatMs ?? 9_000));
      timers.push(setInterval(() => void o.recheck().then((r) => r !== "ok" && finish(`event: end\ndata: ${JSON.stringify({ code: r === "ended" ? "access_ended" : "unauthorized" })}\n\n`)), o.recheckMs ?? 15_000));
      timers.push(setTimeout(() => finish(), o.maxMs ?? 280_000));
      if (o.signal.aborted) finish();
      else o.signal.addEventListener("abort", () => finish(), { once: true });
    },
    cancel() {
      finish();
    },
  });
}
