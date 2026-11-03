import { test } from "node:test";
import assert from "node:assert/strict";
import { deliverableItems, type TreeEntry } from "./deliverable-folders.ts";

const R = "/home/node/Livrables";
const d = (path: string, depth: number, modified = 0): TreeEntry => ({ name: path.split("/").pop()!, path: `${R}/${path}`, type: "directory", modified, depth });
const f = (path: string, depth: number, modified = 0): TreeEntry => ({ name: path.split("/").pop()!, path: `${R}/${path}`, type: "file", modified, depth });

test("one row per subject, newest first, with its owner, files and cover", () => {
  const items = deliverableItems([
    d("Fatima", 0),
    d("Koffi", 0),
    d("Fatima/Newsletter", 1, 10),
    f("Fatima/Newsletter/newsletter.pdf", 2, 50),
    f("Fatima/Newsletter/notes.md", 2, 90),
    d("Koffi/Flyers", 1, 20),
    f("Koffi/Flyers/flyer.png", 2, 30),
    f("Koffi/Flyers/flyer.pdf", 2, 40),
    f("Koffi/charte.pdf", 1, 5),
  ]);
  assert.deepEqual(
    items.map((i) => [i.name, i.owner, i.files, i.modified]),
    [
      ["Newsletter", "Fatima", 1, 50],
      ["Flyers", "Koffi", 2, 40],
      ["charte.pdf", "Koffi", 1, 5],
    ]
  );
  assert.equal(items[1].cover, `${R}/Koffi/Flyers/flyer.png`); // the picture, though the PDF is newer
  assert.equal(items[2].cover, `${R}/Koffi/charte.pdf`);
});

test("what the member brought, the memory and working files are no deliverables", () => {
  const items = deliverableItems([
    d("Fatima", 0),
    d("Fatima/Reçus", 1, 99),
    d("Fatima/_memoire", 1, 99),
    f("Fatima/script.py", 1, 99),
    d("Pièces jointes", 0),
    f("Pièces jointes/devis.pdf", 1, 99),
    d("Fatima/Plan", 1, 1),
    d("Fatima/Plan/source", 2, 1),
    f("Fatima/Plan/plan.docx", 2, 3),
  ]);
  assert.deepEqual(items.map((i) => i.name), ["Plan"]);
  assert.equal(items[0].files, 1);
});
