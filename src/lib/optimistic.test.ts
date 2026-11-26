import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { optimistic } from "./optimistic.ts";

describe("affichage avant le serveur", () => {
  it("montre le changement tout de suite et le garde si le serveur accepte", async () => {
    let shown = "ancien";
    const said: string[] = [];
    const run = optimistic({ apply: () => (shown = "nouveau"), run: async () => undefined, rollback: () => (shown = "ancien"), refused: (m) => said.push(m) });
    assert.equal(shown, "nouveau");
    assert.equal(await run, true);
    assert.equal(shown, "nouveau");
    assert.deepEqual(said, []);
  });

  it("revient en arrière et dit le refus", async () => {
    let shown = "ancien";
    const said: string[] = [];
    const ok = await optimistic({ apply: () => (shown = "nouveau"), run: async () => Promise.reject(new Error("Nom déjà pris")), rollback: () => (shown = "ancien"), refused: (m) => said.push(m) });
    assert.equal(ok, false);
    assert.equal(shown, "ancien");
    assert.deepEqual(said, ["Nom déjà pris"]);
  });

  it("un refus sans message se voit quand même", async () => {
    const said: string[] = [];
    await optimistic({ apply: () => undefined, run: async () => Promise.reject(new Error("")), rollback: () => undefined, refused: (m) => said.push(m) });
    assert.equal(said.length, 1);
    assert.ok(said[0].length > 0);
  });
});
