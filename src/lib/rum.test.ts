import assert from "node:assert/strict";
import { test } from "node:test";
import { measured, parseBatch, sampleRateOf, screenOf } from "./rum.ts";

const rec = { screen: "/livrables", nav: "soft", render: 120.4, inp: 48, interactions: 2, api: 3 };

test("a screen name carries no id, e-mail, query or token", () => {
  assert.equal(screenOf("/conversations/42?c=abc#x"), "/conversations/:id");
  assert.equal(screenOf("/experts/awa-diallo"), "/experts/awa-diallo");
  assert.equal(screenOf("/invite/a@b.co"), "/invite/:id");
  assert.equal(screenOf("/x/7p5qy2effr/files"), "/x/:id/files");
  assert.equal(screenOf("/d/" + "a".repeat(40)), "/d/:id");
  assert.equal(screenOf("/"), "/");
  assert.equal(screenOf("/Livrables/Été"), "/livrables/_t_");
});

test("login, auth and public dashboards are not measured", () => {
  assert.equal(measured("/login"), false);
  assert.equal(measured("/dashboards/view"), false);
  assert.equal(measured("/livrables"), true);
  assert.equal(measured("/loginx"), true);
});

test("sample rate: default 10 %, bounded to 0..1", () => {
  assert.equal(sampleRateOf(undefined), 0);
  assert.equal(sampleRateOf(""), 0);
  assert.equal(sampleRateOf("0"), 0);
  assert.equal(sampleRateOf("3"), 1);
  assert.equal(sampleRateOf("abc"), 0);
});

test("a batch is accepted only in the expected shape, and re-normalised", () => {
  assert.deepEqual(parseBatch({ records: [{ ...rec, screen: "/conversations/123456" }] }), [{ ...rec, screen: "/conversations/:id", render: 120 }]);
  assert.deepEqual(parseBatch({ records: [{ ...rec, render: null, inp: null }] })?.[0]?.render, null);
  assert.equal(parseBatch({ records: [] }), null);
  assert.equal(parseBatch({ records: [{ ...rec, nav: "x" }] }), null);
  assert.equal(parseBatch({ records: [{ ...rec, render: -1 }] }), null);
  assert.equal(parseBatch({ records: [{ ...rec, user: "u" , api: 1.5 }] }), null);
  assert.equal(parseBatch({ records: Array.from({ length: 21 }, () => rec) }), null);
  assert.equal(parseBatch(null), null);
});
