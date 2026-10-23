import assert from "node:assert/strict";
import { test } from "node:test";
import { isDriveClutter, isMemoryFolder, matchesDriveQuery, sortDriveEntries } from "./drive-order.ts";

const e = (name: string, modified: number, type = "file") => ({ name, modified, type });

test("the memory folder is recognised whatever its case, accents or leading underscore", () => {
  for (const n of ["memoire", "Mémoire", "MEMORY", "_memoire", "mémoire"]) assert.equal(isMemoryFolder(n), true, n);
  for (const n of ["memoires", "Mémo", "notes"]) assert.equal(isMemoryFolder(n), false, n);
});

test("memory first, then newest first with folders and files mixed, undated last by name", () => {
  const out = sortDriveEntries([
    e("ancien.pdf", 100),
    e("Clients", 300, "directory"),
    e("zeta.txt", 0),
    e("Mémoire", 50, "directory"),
    e("rapport.xlsx", 500),
    e("alpha.txt", 0),
  ]).map((x) => x.name);
  assert.deepEqual(out, ["Mémoire", "rapport.xlsx", "Clients", "ancien.pdf", "alpha.txt", "zeta.txt"]);
});

test("a file named like the memory folder is not pinned", () => {
  assert.deepEqual(sortDriveEntries([e("memoire", 1), e("b.pdf", 2)]).map((x) => x.name), ["b.pdf", "memoire"]);
});

test("by name, A to Z, the memory folder still first", () => {
  const e = (name: string, type = "file", modified = 1) => ({ name, type, modified });
  const out = sortDriveEntries([e("zèbre.pdf", "file", 9), e("Mémoire", "directory"), e("Abc.docx", "file", 2), e("été.xlsx")], "name");
  assert.deepEqual(out.map((x) => x.name), ["Mémoire", "Abc.docx", "été.xlsx", "zèbre.pdf"]);
});

test("clutter: working files, caches and preview pictures; documents stay", () => {
  const f = (name: string) => isDriveClutter({ name, type: "file" });
  const d = (name: string) => isDriveClutter({ name, type: "directory" });
  for (const n of ["calcul.py", "etat.json", "run.log", "apercu.png", "rapport-apercu.png", "deck-preview-01.png", "Vignette.webp", "thumbnail.jpg", "Aperçu_2.png"]) assert.ok(f(n), n);
  for (const n of ["Point.pdf", "Deck Unifood.pptx", "Trésorerie.xlsx", "Relances.docx", "Affiche Tabaski.png", "previsions.png", "Notes.md"]) assert.ok(!f(n), n);
  for (const n of ["__pycache__", ".cache", "cache", "apercus", "previews"]) assert.ok(d(n), n);
  assert.ok(!d("Clients"));
});

test("search: every word, accents and case aside", () => {
  assert.ok(matchesDriveQuery("Trésorerie à 13 semaines.xlsx", "tresorerie 13"));
  assert.ok(matchesDriveQuery("Relance Lagune.docx", "LAGUNE"));
  assert.ok(!matchesDriveQuery("Relance Lagune.docx", "lagune yao"));
  assert.ok(matchesDriveQuery("x.pdf", "  "));
});
