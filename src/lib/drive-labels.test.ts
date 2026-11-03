import assert from "node:assert/strict";
import { test } from "node:test";
import { deliveryNotices, fileLabel, isMemberUpload, readableTitle } from "./drive-paths.ts";

const R = "/home/node/Livrables";

test("what the member brought is told apart from what an Expert made", () => {
  assert.equal(isMemberUpload(`${R}/Pièces jointes/18om3i4g-facture.pdf`), true);
  assert.equal(isMemberUpload("~/Livrables/Pièces jointes/x.pdf"), true);
  assert.equal(isMemberUpload(`${R}/Fatima/Reçus/brief.pdf`), true);
  assert.equal(isMemberUpload(`${R}/Fatima/Recus/brief.pdf`), true);
  assert.equal(isMemberUpload(`${R}/Fatima/Newsletter/newsletter.pdf`), false);
  assert.equal(isMemberUpload(`${R}/Fatima/Reçus de caisse 2026.pdf`), false);
});

test("an attachment shows its original name, any other file its own", () => {
  assert.equal(fileLabel({ name: "18om3i4g-110_photo_hpl.jpg", path: `${R}/Pièces jointes/18om3i4g-110_photo_hpl.jpg` }), "110_photo_hpl.jpg");
  assert.equal(fileLabel({ name: "8jpohjsp-BLOK · Rapport (v2).pptx", path: `${R}/Pièces jointes/8jpohjsp-BLOK · Rapport (v2).pptx` }), "BLOK · Rapport (v2).pptx");
  // A deliverable whose name happens to start like a prefix keeps it.
  assert.equal(fileLabel({ name: "planning-q4.pdf", path: `${R}/Djénéba/planning-q4.pdf` }), "planning-q4.pdf");
});

const D = "/home/node/Livrables/Djénéba";
test("a delivery is one notice per Expert, formats together, under a readable name", () => {
  assert.equal(readableTitle("261030-yelema-fiche-de-poste-fde_v1.pdf"), "Yelema fiche de poste FDE");
  assert.deepEqual(
    deliveryNotices([
      { name: "261030-yelema-fiche-de-poste-fde_v1.pdf", path: `${D}/Recrutement/261030-yelema-fiche-de-poste-fde_v1.pdf` },
      { name: "261030-yelema-fiche-de-poste-fde_v1.docx", path: `${D}/Recrutement/261030-yelema-fiche-de-poste-fde_v1.docx` },
      { name: "style.css", path: `${D}/Recrutement/style.css` },
      { name: "s.html", path: `${D}/s.html` },
    ]),
    [{ id: `livrables:${D}/Recrutement/261030-yelema-fiche-de-poste-fde_v1.pdf`, title: "Nouveau livrable de Djénéba",
       description: "Yelema fiche de poste FDE (PDF, Word)", folder: `${D}/Recrutement`, expert: "Djénéba", docs: ["Yelema fiche de poste FDE (PDF, Word)"] }]
  );
  const two = deliveryNotices([{ name: "Plan Q4.pdf", path: `${D}/Plan Q4.pdf` }, { name: "Note.docx", path: `${D}/Note.docx` }]);
  assert.equal(two[0].title, "2 nouveaux livrables de Djénéba");
  assert.equal(two[0].description, "Plan Q4, Note");
  assert.deepEqual(deliveryNotices([{ name: "tmp_rapport.md", path: `${D}/tmp_rapport.md` }]), []);
  // Only a finished deliverable: no logo, no page source, no picture of a document, no assets folder.
  assert.deepEqual(
    deliveryNotices([
      { name: "logo.png", path: `${D}/logo.png` },
      { name: "rapport.html", path: `${D}/rapport.html` },
      { name: "notes.md", path: `${D}/notes.md` },
      { name: "flyer-salon.png", path: `${D}/Site/assets/flyer-salon.png` },
    ]),
    []
  );
  const flyer = deliveryNotices([{ name: "Flyer salon Agro.png", path: `${D}/Visuels/Flyer salon Agro.png` }]);
  assert.equal(flyer[0].description, "Flyer salon Agro");
  const withChart = deliveryNotices([
    { name: "Bilan.pdf", path: `${D}/Bilan/Bilan.pdf` },
    { name: "courbe-ventes.png", path: `${D}/Bilan/courbe-ventes.png` },
  ]);
  assert.equal(withChart[0].description, "Bilan");
});
