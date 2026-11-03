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
