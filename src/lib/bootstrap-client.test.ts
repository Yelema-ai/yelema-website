import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ABSENT_MS, createBootstrap, type Bootstrap } from "./bootstrap-client.ts";

const body: Bootstrap = { agentId: "own", preferences: null, deploy: null, spaces: null, tree: null };
const answer = (status: number) => Promise.resolve(new Response(status === 200 ? JSON.stringify(body) : "", { status }));

describe("bootstrap de l'onglet", () => {
  it("un échec est redemandé par l'appelant suivant ; les lecteurs n'attendent plus après une réponse", async () => {
    const statuses = [500, 200];
    let calls = 0;
    const b = createBootstrap(() => (calls++, answer(statuses.shift()!)));
    assert.equal(await b.bootstrap(), null);
    await b.bootstrapped();
    assert.equal(calls, 1, "a reader does not retry a failed bootstrap");
    assert.equal((await b.bootstrap())?.agentId, "own");
    assert.equal(calls, 2);
  });

  it("un 404 n'est pas redemandé avant ABSENT_MS", async () => {
    let t = 0;
    let calls = 0;
    const b = createBootstrap(() => (calls++, answer(404)), () => t);
    await b.bootstrap();
    await b.bootstrap();
    assert.equal(calls, 1);
    t += ABSENT_MS;
    await b.bootstrap();
    assert.equal(calls, 2);
  });

  it("n'attend pas pour une autre instance que la sienne ; un changement d'espace repart de zéro", async () => {
    let calls = 0;
    let release: (r: Response) => void = () => undefined;
    const b = createBootstrap(() => (calls++, new Promise<Response>((r) => (release = r))));
    const seeded: string[] = [];
    b.onBootstrap((x) => void seeded.push(x.agentId ?? ""));
    b.ownedBy("own");
    let other = false;
    const own = b.bootstrapped("own");
    await b.bootstrapped("team").then(() => (other = true));
    assert.equal(other, true);
    b.reset();
    release(new Response(JSON.stringify(body), { status: 200 }));
    await own;
    assert.deepEqual(seeded, [], "an answer of the previous workspace seeds nothing");
    const again = b.bootstrapped();
    release(new Response(JSON.stringify(body), { status: 200 }));
    await again;
    assert.deepEqual(seeded, ["own"]);
    assert.equal(calls, 2);
  });
});
