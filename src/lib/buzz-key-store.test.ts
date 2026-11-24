import assert from "node:assert/strict";
import { test } from "node:test";

import { BUZZ_KEY, BUZZ_RELAY, eraseKeys, keptKeyFor, ownKey, readKey, writeKey } from "./buzz-key-store.ts";

const A = "a".repeat(64);
const B = "b".repeat(64);

function store(seed: Record<string, string> = {}) {
  const m = new Map(Object.entries(seed));
  return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
}

test("a key is written with its account and read back; anything malformed reads as none", () => {
  const s = store();
  writeKey(s, A, "acc1:ws1");
  assert.deepEqual(readKey(s), { hex: A, account: "acc1:ws1" });
  assert.deepEqual(readKey(store({ [BUZZ_KEY]: A })), { hex: A, account: null });
  for (const raw of ["", "xyz", "{", JSON.stringify({ k: "short", a: "x" }), JSON.stringify({ k: A }), JSON.stringify({ k: A, a: "" }), JSON.stringify([A])]) {
    assert.equal(readKey(store({ [BUZZ_KEY]: raw })), null, raw);
  }
});

test("before the back office answers, only the confirmed account's own key opens the relay", () => {
  const mine = { hex: A, account: "acc1:ws1" };
  assert.equal(ownKey(mine, "acc1:ws1"), A);
  assert.equal(ownKey(mine, "acc2:ws1"), null);
  assert.equal(ownKey(mine, "acc1:ws2"), null);
  assert.equal(ownKey(mine, null), null);
  assert.equal(ownKey({ hex: A, account: null }, "acc1:ws1"), null);
  assert.equal(ownKey(null, "acc1:ws1"), null);
});

test("the previous account's key is never reused; an unbound one only when the back office lists it for this member", () => {
  const admitted = (hex: string) => hex === A;
  assert.equal(keptKeyFor({ hex: B, account: "acc1:ws1" }, "acc2:ws1", () => true), null);
  assert.equal(keptKeyFor({ hex: A, account: null }, "acc2:ws1", admitted), A);
  assert.equal(keptKeyFor({ hex: B, account: null }, "acc2:ws1", admitted), null);
  assert.equal(keptKeyFor({ hex: B, account: "acc2:ws1" }, "acc2:ws1", admitted), B);
  assert.equal(keptKeyFor({ hex: A, account: "acc2:ws1" }, null, admitted), null);
});

test("sign-out leaves neither the key nor the relay's address, in any storage, even one that throws", () => {
  const local = store({ [BUZZ_KEY]: JSON.stringify({ k: A, a: "acc1:ws1" }), autre: "gardé" });
  const session = store({ [BUZZ_RELAY]: "wss://relais", [BUZZ_KEY]: A });
  const broken = { removeItem: () => { throw new Error("denied"); } };
  eraseKeys(local, broken, null, session);
  assert.deepEqual([...local.m], [["autre", "gardé"]]);
  assert.equal(session.m.size, 0);
});
