import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { cached, cachedFetch, remember } from "./client-cache.ts";

describe("lectures partagées du navigateur", () => {
  it("une lecture d'avance récente sert la page : aucun second appel dans le délai", async () => {
    let calls = 0;
    const load = async () => (calls++, ["s1"]);
    await cachedFetch("sessions:a", load, 60_000);
    await cachedFetch("sessions:a", load, 60_000);
    assert.equal(calls, 1);
    assert.deepEqual(cached("sessions:a"), ["s1"]);
  });

  it("deux demandes simultanées font un seul appel ; une valeur posée sert la suivante", async () => {
    let calls = 0;
    const load = async () => (calls++, 1);
    await Promise.all([cachedFetch("models:b", load), cachedFetch("models:b", load)]);
    assert.equal(calls, 1);
    remember("sessions:c", ["lu par le menu"]);
    assert.deepEqual(await cachedFetch("sessions:c", async () => (calls++, ["relu"]), 15_000), ["lu par le menu"]);
    assert.equal(calls, 1);
  });
});

describe("copie de l'appareil dans le cache de l'onglet", () => {
  it("se montre tout de suite mais la lecture suivante part quand même", async () => {
    const { hydrate, keptOnly } = await import("./client-cache.ts");
    hydrate("drive-tree:z", ["vieux"]);
    assert.deepEqual(cached("drive-tree:z"), ["vieux"]);
    assert.equal(keptOnly("drive-tree:z"), true);
    let calls = 0;
    assert.deepEqual(await cachedFetch("drive-tree:z", async () => (calls++, ["frais"]), 60_000), ["frais"]);
    assert.equal(calls, 1);
    assert.equal(keptOnly("drive-tree:z"), false);
    hydrate("drive-tree:z", ["vieux"]);
    assert.deepEqual(cached("drive-tree:z"), ["frais"]);
  });

  it("whenKept sert la copie arrivée plus tard, une seule fois", async () => {
    const { hydrate, whenKept } = await import("./client-cache.ts");
    const got: unknown[] = [];
    whenKept("chat:q", (v) => got.push(v));
    hydrate("chat:q", [1]);
    remember("chat:q", [2]);
    assert.deepEqual(got, [[1]]);
  });

  it("une lecture groupée en cours est rejointe ; une partie absente retombe sur sa route", async () => {
    const { pending } = await import("./client-cache.ts");
    let own = 0;
    pending("models:g", Promise.resolve(["groupé"]), async () => (own++, ["seul"]));
    assert.deepEqual(await cachedFetch("models:g", async () => (own++, ["seul"])), ["groupé"]);
    pending("models:h", Promise.resolve(null), async () => (own++, ["seul"]));
    assert.deepEqual(await cachedFetch("models:h", async () => ["jamais"]), ["seul"]);
    assert.equal(own, 1);
  });
});
