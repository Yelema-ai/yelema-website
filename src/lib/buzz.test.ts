import assert from "node:assert/strict";
import { test } from "node:test";
import { conversationName, labelsOf, type BuzzEntry } from "./buzz.ts";

const k = (c: string) => c.repeat(64);
const directory: BuzzEntry[] = [
  { nom: "Leslie", type: "personne", membre: "16", cles: [k("a"), k("b")] },
  { nom: "Mamadou (de Leslie)", type: "expert", membre: "16", cles: [k("c")] },
  { nom: "Selim", type: "personne", membre: "21", cles: [k("d")] },
];

test("une clé se nomme d'après l'annuaire, tous appareils d'une personne confondus", () => {
  const labels = labelsOf(directory);
  assert.equal(labels.get(k("b")), "Leslie");
  assert.equal(labels.get(k("c")), "Mamadou (de Leslie)");
});

test("une conversation directe porte le nom des autres, sans doublon ni soi-même", () => {
  const labels = labelsOf(directory);
  assert.equal(conversationName([k("a"), k("b"), k("c"), k("d")], [k("d")], labels, "DM"), "Leslie, Mamadou (de Leslie)");
  assert.equal(conversationName([k("d")], [k("d")], labels, "DM (1)"), "DM (1)");
});
