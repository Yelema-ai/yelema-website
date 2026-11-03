import assert from "node:assert/strict";
import { test } from "node:test";
import { isSystemSession } from "./system-sessions.ts";

test("the day-zero preparation is no conversation of the member", () => {
  assert.equal(isSystemSession({ title: "Préparation du jour zéro : applique ta compétence jour-zero", preview: null }), true);
  assert.equal(isSystemSession({ title: null, preview: "Preparation du jour zero : applique…" }), true);
  assert.equal(isSystemSession({ title: "Préparer la réunion du jour", preview: "Prépare la réunion" }), false);
  assert.equal(isSystemSession({ title: "Le jour zéro de la campagne", preview: "" }), false);
});
