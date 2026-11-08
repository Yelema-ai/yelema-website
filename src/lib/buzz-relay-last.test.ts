import assert from "node:assert/strict";
import { test } from "node:test";
import { finalizeEvent, generateSecretKey, type Event } from "nostr-tools/pure";
import { watchLast, type BuzzConnection, type Filter, type Message } from "./buzz-relay.ts";

const sk = generateSecretKey();
const ev = (channel: string, at: number, content: string): Event => finalizeEvent({ kind: 9, created_at: at, tags: [["h", channel]], content }, sk);

test("watchLast: one request for every salon, one callback with the newest message of each", async () => {
  const requests: Filter[][] = [];
  const batches: Record<string, Message>[] = [];
  const store = [ev("a", 10, "vieux a"), ev("a", 30, "dernier a"), ev("b", 20, "dernier b")];
  const conn = {
    queryAny: async (filters: Filter[]) => (requests.push(filters), store),
    subscribe: () => ({ close: () => undefined }),
  } as unknown as BuzzConnection;

  const watch = watchLast(conn, ["a", "b", "c"], (lasts) => batches.push(lasts));
  await new Promise((r) => setImmediate(r));
  watch.close();

  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0].map((f) => [f["#h"], f.limit]), [[["a"], 1], [["b"], 1], [["c"], 1]]);
  assert.equal(batches.length, 1);
  assert.deepEqual(Object.fromEntries(Object.entries(batches[0]).map(([k, m]) => [k, m.text])), { a: "dernier a", b: "dernier b" });
});
