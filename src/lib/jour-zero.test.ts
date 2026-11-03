import assert from "node:assert/strict";
import { test } from "node:test";
import { FIX, JOUR_ZERO_ABSENT, JOUR_ZERO_CHECK_IDS, JOUR_ZERO_MAX_BYTES, parseJourZero, pointsLeft, readiness, stage } from "./jour-zero.ts";

const check = (id: string, ok: unknown = true, extra: object = {}) => ({ id, label: `Vérif ${id}`, ok, detail: "ok", ...extra });
const file = (extra: object = {}) =>
  JSON.stringify({ version: 1, date: "2026-10-17T08:00:00Z", pret: true, checks: ["outils", "competences", "entreprise", "charte", "canaux"].map((id) => check(id)), ...extra });

test("a version-1 file gives its checks", () => {
  const jz = parseJourZero(file());
  assert.equal(jz?.pret, true);
  assert.equal(jz?.checks.length, 5);
  assert.equal(jz?.date, "2026-10-17T08:00:00Z");
});

test("anything that is not a version-1 preparation is refused", () => {
  assert.equal(parseJourZero("pas du json"), null);
  assert.equal(parseJourZero("[]"), null);
  assert.equal(parseJourZero(file({ version: 2 })), null);
  assert.equal(parseJourZero(file({ pret: "oui" })), null);
  assert.equal(parseJourZero(file({ checks: {} })), null);
  assert.equal(parseJourZero(" ".repeat(JOUR_ZERO_MAX_BYTES + 1)), null);
});

test("a bad check alone is dropped, and an id counts once", () => {
  const jz = parseJourZero(
    file({ checks: [check("outils"), check("inconnu"), check("charte", "oui"), check("canaux", true, { label: "" }), check("outils", false), check("entreprise", true, { detail: "x".repeat(401) })] })
  );
  assert.deepEqual(jz?.checks.map((c) => c.id), ["outils"]);
  assert.equal(parseJourZero(file({ date: "hier" }))?.date, null);
  assert.equal(parseJourZero(file({ checks: [{ id: "outils", label: "Outils", ok: false }] }))?.checks[0].detail, "");
});

test("readiness: ready, partial or not prepared", () => {
  assert.deepEqual(readiness(parseJourZero(file())!), { state: "ready", label: "Prêt" });
  const partial = parseJourZero(file({ pret: false, checks: [check("outils", false), check("charte"), check("canaux"), check("entreprise"), check("competences", false)] }))!;
  assert.deepEqual(readiness(partial), { state: "partial", label: "Préparation 3/5" });
  assert.equal(readiness(parseJourZero(file({ pret: true, checks: [check("outils", false)] }))!).state, "partial");
  assert.deepEqual(readiness(JOUR_ZERO_ABSENT), { state: "absent", label: "Pas encore préparé" });
  assert.equal(readiness(parseJourZero(file({ pret: false, checks: [] }))!).state, "absent");
});

test("stage: « Faire connaissance » first, then the points left, then nothing", () => {
  const left = { pret: false, checks: [check("outils", false), check("charte"), check("canaux"), check("entreprise"), check("competences")] };
  assert.equal(stage(parseJourZero(file(left))!), "intro");
  assert.equal(stage(JOUR_ZERO_ABSENT), "intro");
  const after = parseJourZero(file({ ...left, onboarding: "2026-10-31T21:00:00Z" }))!;
  assert.equal(after.onboarding, "2026-10-31T21:00:00Z");
  assert.equal(stage(after), "left");
  assert.deepEqual(pointsLeft(after).map((c) => c.id), ["outils"]);
  assert.equal(stage(parseJourZero(file())!), "ready");
  assert.equal(parseJourZero(file({ onboarding: "hier" }))?.onboarding, null);
});

test("every point has its sentence; only the skills have no page", () => {
  for (const id of JOUR_ZERO_CHECK_IDS) assert.ok(FIX[id].text.length > 10);
  assert.deepEqual(JOUR_ZERO_CHECK_IDS.filter((id) => !FIX[id].action), ["competences"]);
});
