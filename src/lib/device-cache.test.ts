import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { accountHash, carriesSecret, createDeviceCache, memoryBackend, META_KEY, scrubSigned, type CacheRow } from "./device-cache.ts";

function harness(seed: CacheRow[] = [], maxBytes = 10_000, version = 1) {
  let t = 1000;
  const later: (() => void)[] = [];
  const backend = memoryBackend(seed);
  const cache = createDeviceCache(backend, { version, maxBytes, now: () => t++, defer: (fn) => void later.push(fn) });
  const settle = async () => {
    while (later.length) later.shift()!();
    await new Promise((r) => setImmediate(r));
  };
  return { cache, backend, settle };
}

const meta = (scope: string, version = 1): CacheRow => ({ key: META_KEY, value: { scope, version }, at: 0, size: 0 });
const row = (key: string, value: unknown, at = 1): CacheRow => ({ key, value, at, size: JSON.stringify(value).length * 2 });

describe("cache de l'appareil", () => {
  it("rend les lignes du même compte et du même espace, écrites sur l'appareil", async () => {
    const h = harness([meta("u1:w1"), row("experts:w1", ["Awa"])]);
    await h.cache.open("u1:w1");
    assert.ok(h.cache.ready());
    assert.deepEqual(h.cache.get("experts:w1"), ["Awa"]);
    h.cache.set("chat:a:s1", [{ id: "m1" }]);
    await h.settle();
    assert.deepEqual(h.backend.rows.get("chat:a:s1")?.value, [{ id: "m1" }]);
  });

  it("un autre compte ou un autre espace efface tout", async () => {
    for (const other of ["u2:w1", "u1:w2"]) {
      const h = harness([meta("u1:w1"), row("experts:w1", ["Awa"])]);
      await h.cache.open(other);
      assert.equal(h.cache.get("experts:w1"), undefined);
      assert.deepEqual([...h.backend.rows.keys()], [META_KEY]);
      assert.deepEqual(h.backend.rows.get(META_KEY)?.value, { scope: other, version: 1 });
    }
  });

  it("une autre version du format efface tout", async () => {
    const h = harness([meta("u1:w1", 1), row("experts:w1", ["Awa"])], 10_000, 2);
    await h.cache.open("u1:w1");
    assert.equal(h.cache.get("experts:w1"), undefined);
    assert.equal(h.backend.rows.size, 1);
  });

  it("la déconnexion ne laisse rien, et plus rien ne s'écrit ensuite", async () => {
    const h = harness([meta("u1:w1"), row("experts:w1", ["Awa"])]);
    await h.cache.open("u1:w1");
    await h.cache.wipe();
    assert.equal(h.backend.rows.size, 0);
    assert.equal(h.cache.set("experts:w1", ["Awa"]), false);
    await h.settle();
    assert.equal(h.backend.rows.size, 0);
  });

  it("au-delà de la taille, la ligne la moins récemment servie part la première", async () => {
    const h = harness([meta("s")], 300);
    await h.cache.open("s");
    h.cache.set("a", "x".repeat(40));
    h.cache.set("b", "x".repeat(40));
    h.cache.get("a");
    h.cache.set("c", "x".repeat(40));
    h.cache.set("d", "x".repeat(40));
    assert.equal(h.cache.get("b"), undefined);
    assert.ok(h.cache.get("a"));
    assert.ok(h.cache.bytes() <= 300);
    await h.settle();
    assert.equal(h.backend.rows.has("b"), false);
  });

  it("refuse une valeur qui porte un secret ou trop grosse ; efface les adresses signées", async () => {
    const h = harness([meta("s")], 1_000);
    await h.cache.open("s");
    assert.equal(h.cache.set("x", { user: { accessToken: "eyJ" } }), false);
    assert.equal(h.cache.set("y", "x".repeat(500)), false);
    h.cache.set("z", { photoUrl: "https://cdn.test/a.png?token=abc", name: "Awa", url: "https://cdn.test/b.png" });
    assert.deepEqual(h.cache.get("z"), { photoUrl: null, name: "Awa", url: "https://cdn.test/b.png" });
    assert.equal(carriesSecret({ list: [{ password: "p" }] }), true);
    assert.equal(carriesSecret({ catalogueKey: "awa", token: null }), false);
    assert.equal(scrubSigned("voir ?token=1 dans le texte"), "voir ?token=1 dans le texte");
  });

  it("le compte n'est jamais gardé en clair", () => {
    assert.notEqual(accountHash("a@b.c"), "a@b.c");
    assert.equal(accountHash("a@b.c"), accountHash("a@b.c"));
    assert.notEqual(accountHash("a@b.c"), accountHash("b@b.c"));
  });
});
