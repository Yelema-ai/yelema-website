import assert from "node:assert/strict";
import { test } from "node:test";
import { byDeadline, FIRST_SCREEN_BUDGET_MS, settledByKey, spaceKey, STREAM_GUARD_MS, within } from "./first-screen.ts";

test("un premier écran lu à temps est transmis ; en retard ou en échec, le navigateur le lit lui-même", async () => {
  assert.equal(await within(Promise.resolve(1), 50), 1);
  assert.equal(await within(new Promise((r) => setTimeout(() => r(1), 200)), 10), null);
  assert.equal(await within(Promise.reject(new Error("x")), 50), null);
});

test("une lecture streamée qui ne s'achève jamais rend la main au navigateur, après le budget du serveur", async () => {
  assert.equal(await within(new Promise(() => undefined), 10), null);
  assert.ok(STREAM_GUARD_MS > FIRST_SCREEN_BUDGET_MS);
});

test("chaque espace sous sa clé, ceux en échec laissés de côté", async () => {
  const keys = [spaceKey("a", null), spaceKey("a", "awa")];
  assert.deepEqual(keys, ["a:", "a:awa"]);
  const out = await settledByKey(keys, async (k) => (k === "a:" ? 1 : Promise.reject(new Error("down"))));
  assert.deepEqual(out, { "a:": 1 });
});

test("une seule échéance : une lecture lancée plus tard n'a que le temps qui reste", async () => {
  let t = 0;
  const left = byDeadline(100, () => t);
  t = 90;
  const slow = new Promise((r) => setTimeout(() => r(1), 40));
  const started = Date.now();
  assert.equal(await left(slow), null);
  assert.ok(Date.now() - started < 35, "attend 10 ms, pas 100");
  t = 200;
  assert.equal(await left(Promise.resolve(2)), 2, "une réponse déjà là passe encore");
});
