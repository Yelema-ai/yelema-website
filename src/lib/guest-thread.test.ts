import assert from "node:assert/strict";
import { test } from "node:test";
import { finalizeEvent, generateSecretKey, getPublicKey, verifyEvent, type Event, type EventTemplate } from "nostr-tools/pure";
import { bytesToHex } from "nostr-tools/utils";
import { guestLimits, sameOriginPost } from "./guest-access.ts";
import { GuestPostError, guestHistory, guestPost, guestStream, inSalon, sinceOf, type StreamRelay } from "./guest-thread.ts";

const SALON = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const member = generateSecretKey();
const guest = generateSecretKey();
const names = new Map([[getPublicKey(member), "Leslie"]]);
let clock = 1_800_000_000;
const ev = (kind: number, tags: string[][], content = "salut", sk = member): Event => finalizeEvent({ kind, created_at: clock++, tags, content }, sk);
const filterOf = (f: Record<string, unknown>) => f;

/** A relay that answers a REQ like Buzz would, but WITHOUT filtering: the guest code must drop the strays. */
function fakeRelay(store: Event[], secret = guest) {
  const published: Event[] = [];
  return {
    published,
    query: async (f: Record<string, unknown>) => {
      const ids = f.ids as string[] | undefined;
      return ids ? store.filter((e) => ids.includes(e.id)) : store;
    },
    sign: (t: EventTemplate) => finalizeEvent(t, secret),
    publishSigned: async (e: Event) => (published.push(e), { ok: true, message: "", id: e.id }),
  };
}

test("seuls les messages de CE salon passent : autre h, DM, roster, profil, deux h écartés", () => {
  assert.equal(inSalon(ev(9, [["h", SALON]]), SALON), true);
  assert.equal(inSalon(ev(9, [["h", OTHER]]), SALON), false);
  assert.equal(inSalon(ev(9, [["h", SALON], ["h", OTHER]]), SALON), false);
  assert.equal(inSalon(ev(9, []), SALON), false);
  for (const kind of [0, 4, 14, 1059, 39000, 39002, 41010]) assert.equal(inSalon(ev(kind, [["h", SALON], ["p", "x"]]), SALON), false, String(kind));
});

test("historique : filtré par le serveur, parents d'un autre salon jamais rendus, noms du salon", async () => {
  const foreign = ev(9, [["h", OTHER]], "secret d'un autre salon");
  const parent = ev(9, [["h", SALON]], "parent");
  const reply = ev(9, [["h", SALON], ["e", parent.id, "", "root"], ["e", parent.id, "", "reply"]], "réponse");
  const stray = ev(9, [["h", SALON], ["e", foreign.id, "", "root"], ["e", foreign.id, "", "reply"]], "réponse à l'étranger");
  const store = [reply, stray, foreign, ev(39002, [["d", SALON], ["p", "k"]]), ev(9, [["h", "dm-1"]], "DM")];
  const relay = fakeRelay(store);
  const queried: Record<string, unknown>[] = [];
  const page = await guestHistory({ query: (f) => (queried.push(filterOf(f)), relay.query(f)) }, SALON, names, null);
  assert.deepEqual(page.messages.map((m) => m.text), ["réponse", "réponse à l'étranger"]);
  assert.deepEqual(page.refs, []);
  assert.equal(page.messages[0].nom, "Leslie");
  assert.deepEqual(queried[0]["#h"], [SALON]);
  assert.deepEqual(queried[1]["#h"], [SALON]);
  // The parent of this salon, missing from the page, is fetched.
  const withParent = await guestHistory(fakeRelay([reply, parent]), SALON, names, null);
  assert.equal(withParent.messages.length, 2);
  const onlyReply = await guestHistory({ query: async (f) => ((f as { ids?: string[] }).ids ? [parent, foreign] : [reply]) }, SALON, names, null);
  assert.deepEqual(onlyReply.refs.map((m) => m.text), ["parent"]);
});

test("publier : un événement kind 9 du salon, signé et valide, racine NIP-10 calculée par le serveur", async () => {
  const root = ev(9, [["h", SALON]], "racine");
  const mid = ev(9, [["h", SALON], ["e", root.id, "", "root"], ["e", root.id, "", "reply"]], "milieu");
  const relay = fakeRelay([root, mid]);
  const m = await guestPost(relay, SALON, names, "  bonjour  ", mid.id);
  const [sent] = relay.published;
  assert.equal(verifyEvent(sent), true);
  assert.equal(sent.pubkey, getPublicKey(guest));
  assert.equal(sent.kind, 9);
  assert.deepEqual(sent.tags, [["h", SALON], ["e", root.id, "", "root"], ["e", mid.id, "", "reply"]]);
  assert.equal(sent.content, "bonjour");
  assert.equal(m.id, sent.id);
  assert.deepEqual([m.root, m.replyTo], [root.id, mid.id]);
  // A plain message: only the salon tag, no mention.
  await guestPost(relay, SALON, names, "seul", null);
  assert.deepEqual(relay.published[1].tags, [["h", SALON]]);
});

test("publier : répondre à un message d'un autre salon (ou inconnu) est refusé, rien n'est publié", async () => {
  const foreign = ev(9, [["h", OTHER]]);
  const dm = ev(14, [["h", SALON]]);
  const relay = fakeRelay([foreign, dm]);
  for (const target of [foreign.id, dm.id, "f".repeat(64), "pas un id", 42]) {
    await assert.rejects(guestPost(relay, SALON, names, "x", target), (e: unknown) => e instanceof GuestPostError && e.code === "reply_outside");
  }
  await assert.rejects(guestPost(relay, SALON, names, "   ", null), (e: unknown) => e instanceof GuestPostError && e.status === 422);
  await assert.rejects(guestPost(relay, SALON, names, "a".repeat(8001), null), (e: unknown) => e instanceof GuestPostError && e.code === "too_long");
  assert.equal(relay.published.length, 0);
});

test("la clé privée de l'invité n'apparaît dans aucune réponse", async () => {
  const hex = bytesToHex(guest);
  const relay = fakeRelay([ev(9, [["h", SALON]])]);
  const posted = await guestPost(relay, SALON, names, "bonjour", null);
  const page = await guestHistory(relay, SALON, names, null);
  for (const body of [posted, page]) assert.ok(!JSON.stringify(body).includes(hex));
});

test("POST invité : CSRF (même origine + JSON) et 20 messages par minute et par session", () => {
  const h = (o: Record<string, string>) => ({ get: (n: string) => o[n] ?? null });
  assert.equal(sameOriginPost(h({ "content-type": "application/json", "sec-fetch-site": "cross-site" })), false);
  assert.equal(sameOriginPost(h({ "content-type": "text/plain", "sec-fetch-site": "same-origin" })), false);
  assert.equal(sameOriginPost(h({ "content-type": "application/json", "sec-fetch-site": "same-origin" })), true);
  const { post } = guestLimits();
  for (let i = 0; i < 20; i++) assert.equal(post("session-a", 0).ok, true);
  assert.equal(post("session-a", 0).ok, false);
  assert.equal(post("session-b", 0).ok, true);
  assert.equal(post("session-a", 61_000).ok, true);
});

class FakeStream implements StreamRelay {
  onclose: (() => void) | null = null;
  closed = false;
  filter: Record<string, unknown> | null = null;
  push: (e: Event) => void = () => undefined;
  subscribe(f: Record<string, unknown>, onEvent: (e: Event) => void) {
    this.filter = f;
    this.push = onEvent;
    return { close: () => undefined };
  }
  close() {
    this.closed = true;
  }
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  let out = "";
  const dec = new TextDecoder();
  for await (const chunk of stream as unknown as AsyncIterable<Uint8Array>) out += dec.decode(chunk);
  return out;
}

test("flux : seuls les messages du salon partent, la fin de l'accès ferme le flux et la connexion", async () => {
  const relay = new FakeStream();
  let state: "ok" | "ended" = "ok";
  const ac = new AbortController();
  const stream = guestStream({ relay, channel: SALON, names, since: 100, recheck: async () => state, signal: ac.signal, heartbeatMs: 5, recheckMs: 20, maxMs: 5_000 });
  const reading = readAll(stream);
  await new Promise((r) => setTimeout(r, 1));
  assert.deepEqual(relay.filter?.["#h"], [SALON]);
  assert.equal(relay.filter?.since, 100);
  const ok = ev(9, [["h", SALON]], "visible");
  relay.push(ok);
  relay.push(ev(9, [["h", OTHER]], "AUTRE-SALON"));
  relay.push(ev(39002, [["d", SALON], ["p", "k"]], "ROSTER"));
  relay.push(ev(4, [["h", SALON]], "DM"));
  state = "ended";
  const out = await reading;
  assert.ok(out.includes(`id: ${ok.created_at}\ndata: `) && out.includes("visible"));
  for (const s of ["AUTRE-SALON", "ROSTER", "\"DM\""]) assert.ok(!out.includes(s), s);
  assert.ok(out.includes("event: ping"));
  assert.ok(out.trimEnd().endsWith(`event: end\ndata: {"code":"access_ended"}`));
  assert.equal(relay.closed, true);
});

test("flux : fermé à la durée maximale ou quand le relais tombe ; reprise depuis Last-Event-ID", async () => {
  const relay = new FakeStream();
  const out = await readAll(guestStream({ relay, channel: SALON, names, since: 0, recheck: async () => "ok", signal: new AbortController().signal, maxMs: 10 }));
  assert.ok(out.startsWith("retry: "));
  assert.equal(relay.closed, true);
  const dropped = new FakeStream();
  const reading = readAll(guestStream({ relay: dropped, channel: SALON, names, since: 0, recheck: async () => "ok", signal: new AbortController().signal }));
  await new Promise((r) => setTimeout(r, 1));
  dropped.onclose?.();
  await reading;
  assert.equal(dropped.closed, true);
  assert.equal(sinceOf("1000", 2000), 990);
  assert.equal(sinceOf(null, 2000), 2000);
  assert.equal(sinceOf("9999", 2000), 2000);
  assert.equal(sinceOf("1", 2_000_000), 2_000_000 - 7 * 86_400);
});
