import assert from "node:assert/strict";
import { test } from "node:test";
import { commandGuide } from "./command-guide.ts";

const team = [
  { id: "unifood__kouassi", name: "Kouassi" },
  { id: "unifood__koffi", name: "Koffi" },
  { id: "unifood__djeneba", name: "Djénéba" },
];

test("commandGuide: a need finds the Expert and the command, with an example", () => {
  const out = commandGuide(team, "comment je fais pour préparer un devis ?");
  assert.match(out, /Kouassi, « [^»]+ » \(\/devis\)/);
  assert.match(out, /tapez « \/ »/);
});

test("commandGuide: the brand book goes to Koffi", () => {
  assert.match(commandGuide(team, "créer notre charte graphique"), /Koffi, « [^»]+ » \(\/charte\)/);
});

test("commandGuide: without a need, each Expert and its commands", () => {
  const out = commandGuide(team);
  assert.match(out, /^- Kouassi : /m);
  assert.match(out, /^- Koffi : /m);
});

test("commandGuide: nothing matching says so, and no command is made up", () => {
  const out = commandGuide(team, "réserver un billet d'avion pour Dakar");
  assert.doesNotMatch(out, /\(\/[a-z]/);
});

test("commandGuide: an Expert unknown to the package has none", () => {
  assert.match(commandGuide([{ id: "x__inconnu", name: "Inconnu" }], "devis"), /Aucun Expert installé/);
});
