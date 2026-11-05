import assert from "node:assert/strict";
import { test } from "node:test";
import { echangesOn } from "./echanges.ts";

test("Échanges : masqué sauf ECHANGES=on", () => {
  assert.equal(echangesOn(undefined), false);
  assert.equal(echangesOn(""), false);
  assert.equal(echangesOn("off"), false);
  assert.equal(echangesOn(" ON "), true);
});
