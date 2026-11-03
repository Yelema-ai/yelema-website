import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { sha256Key, sharedCacheOn, sharedLayer, throughShared, type RuntimeCacheLike } from "./shared-cache.ts";

function fakeCache() {
  const rows = new Map<string, { value: unknown; ttl?: number; name?: string }>();
  const cache: RuntimeCacheLike = {
    get: async (k) => rows.get(k)?.value ?? null,
    set: async (k, value, o) => void rows.set(k, { value, ttl: o?.ttl, name: o?.name }),
    delete: async (k) => void rows.delete(k),
  };
  return { rows, cache };
}

describe("shared session cache (Vercel Runtime Cache)", () => {
  it("off unless SHARED_SESSION_CACHE=on AND running on Vercel", () => {
    assert.equal(sharedCacheOn({}), false);
    assert.equal(sharedCacheOn({ SHARED_SESSION_CACHE: "on" }), false);
    assert.equal(sharedCacheOn({ VERCEL: "1" }), false);
    assert.equal(sharedCacheOn({ SHARED_SESSION_CACHE: "off", VERCEL: "1" }), false);
    assert.equal(sharedCacheOn({ SHARED_SESSION_CACHE: "on", VERCEL: "1" }), true);
  });

  it("writes with its TTL and a fixed name (never the key), reads back, drops", async () => {
    const { rows, cache } = fakeCache();
    const layer = sharedLayer<{ id: string }>("me", 15, async () => cache);
    assert.equal(await layer.read("ws:abc"), undefined);
    await layer.write("ws:abc", { id: "u1" });
    assert.deepEqual(rows.get("ws:abc"), { value: { id: "u1" }, ttl: 15, name: "me" });
    assert.deepEqual(await layer.read("ws:abc"), { id: "u1" });
    await layer.drop("ws:abc");
    assert.equal(await layer.read("ws:abc"), undefined);
  });

  it("the cache down or missing reads as a miss and never throws", async () => {
    const broken: RuntimeCacheLike = { get: () => Promise.reject(new Error("down")), set: () => Promise.reject(new Error("down")), delete: () => Promise.reject(new Error("down")) };
    const a = sharedLayer<number>("me", 15, async () => broken);
    assert.equal(await a.read("k"), undefined);
    await a.write("k", 1);
    await a.drop("k");
    const b = sharedLayer<number>("me", 15, () => Promise.reject(new Error("no package")));
    assert.equal(await b.read("k"), undefined);
  });

  it("keys hash to 256 bits, not the package's 32-bit default", () => {
    assert.match(sha256Key("ws:token"), /^[0-9a-f]{64}$/);
    assert.notEqual(sha256Key("ws:a"), sha256Key("ws:b"));
  });
});

describe("throughShared", () => {
  const refused = (e: unknown) => (e as { status?: number }).status === 401;
  const run = (p: Promise<void>) => void p;

  it("a shared answer spares the load; a miss loads once and writes the answer", async () => {
    const { rows, cache } = fakeCache();
    const layer = sharedLayer<string>("me", 15, async () => cache);
    let loads = 0;
    const load = async () => (loads++, "fresh");
    assert.equal(await throughShared(layer, "k", load, refused, run), "fresh");
    await new Promise((r) => setImmediate(r));
    assert.equal(rows.get("k")?.value, "fresh");
    assert.equal(await throughShared(layer, "k", load, refused, run), "fresh");
    assert.equal(loads, 1);
  });

  it("🔒 a failure is never written; a refusal drops what another function kept", async () => {
    const { rows, cache } = fakeCache();
    const layer = sharedLayer<string>("me", 15, async () => cache);
    await assert.rejects(throughShared(layer, "k", () => Promise.reject(Object.assign(new Error("down"), { status: 503 })), refused, run));
    assert.equal(rows.has("k"), false);
    // Another function kept an answer this one did not read in time (its read missed): the refusal drops it.
    await layer.write("k3", "old");
    const gone = sharedLayer<string>("me", 15, async () => ({ ...cache, get: async () => null }));
    await assert.rejects(throughShared(gone, "k3", () => Promise.reject(Object.assign(new Error("no"), { status: 401 })), refused, run));
    await new Promise((r) => setImmediate(r));
    assert.equal(rows.has("k3"), false);
  });
});
