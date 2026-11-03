import { test } from "node:test";
import assert from "node:assert/strict";
import { googleDocs, googleDocOf, usedGoogleDocs, parseShortcut, shortcutKind, shortcutTitle, titleFromLabel, withoutGoogleActions } from "./google-docs.ts";

const SHEET = "https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcd/edit#gid=0";
const DOC = "https://docs.google.com/document/d/1ZyXwVuTsRqPoNmLkJiHgFeDcBa9876543210zyxw/edit?usp=sharing";

test("a Google url gives its document, whatever its tail", () => {
  assert.deepEqual(googleDocOf(SHEET), { id: "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcd", kind: "sheets", url: "https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcd/edit" });
  assert.equal(googleDocOf(DOC)?.kind, "docs");
  assert.equal(googleDocOf("https://drive.google.com/file/d/abc/view"), null);
});

test("a link's label gives the title", () => {
  assert.equal(titleFromLabel("Ouvrir le suivi des candidatures"), "Suivi des candidatures");
  assert.equal(titleFromLabel("**Ouvrir la fiche de poste BDM**"), "Fiche de poste BDM");
  assert.equal(titleFromLabel("Ouvrir l’agenda"), "Agenda");
  assert.equal(titleFromLabel("Google Sheet"), null);
  assert.equal(titleFromLabel("ici"), null);
});

test("each document of a reply once, titled by its best link", () => {
  const text = `📊 Le suivi est prêt : ${SHEET}\n\n🔗 [Ouvrir le suivi des candidatures](${SHEET})\n🔗 [Ouvrir la fiche de poste BDM](${DOC})`;
  assert.deepEqual(googleDocs(text).map((d) => [d.kind, d.title]), [["sheets", "Suivi des candidatures"], ["docs", "Fiche de poste BDM"]]);
  assert.deepEqual(googleDocs(`Le tableau : ${SHEET}`).map((d) => d.title), ["Google Sheets"]);
  assert.deepEqual(googleDocs("Rien ici."), []);
});

test("the « Ouvrir » line to a Google document goes, the rest stays", () => {
  assert.equal(withoutGoogleActions(`✅ C'est prêt.\n\n🔗 [Ouvrir le suivi](${SHEET})`), "✅ C'est prêt.");
  assert.equal(withoutGoogleActions(`Voir [le suivi](${SHEET}) pour le détail.`), `Voir [le suivi](${SHEET}) pour le détail.`);
});

test("a shortcut in the drive points to its document", () => {
  assert.equal(shortcutKind("Suivi des candidatures.gsheet"), "sheets");
  assert.equal(shortcutKind("rapport.pdf"), null);
  assert.equal(shortcutTitle("Fiche de poste BDM.gdoc"), "Fiche de poste BDM");
  assert.deepEqual(parseShortcut("Suivi.gsheet", JSON.stringify({ url: SHEET })), { id: "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcd", kind: "sheets", url: "https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcd/edit", title: "Suivi" });
  assert.equal(parseShortcut("Plan.gslides", JSON.stringify({ doc_id: "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcd", title: "Plan Q4" }))?.url, "https://docs.google.com/presentation/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcd/edit");
  assert.equal(parseShortcut("Suivi.gsheet", "pas du json"), null);
  assert.equal(parseShortcut("Suivi.gsheet", JSON.stringify({ url: "https://evil.example/x" })), null);
});

test("the document named in a later reply, without its link, is the one in use", () => {
  const used = usedGoogleDocs([
    { text: `🔗 [Ouvrir le suivi des candidatures](${SHEET})`, at: 1 },
    { text: `🔗 [Ouvrir la fiche de poste BDM](${DOC})`, at: 2 },
    { text: "✅ Les statuts sont à jour dans le Suivi des candidatures.", at: 3 },
  ]);
  assert.deepEqual(used.map((d) => [d.title, d.usedAt]), [["Suivi des candidatures", 3], ["Fiche de poste BDM", 2]]);
  assert.deepEqual(usedGoogleDocs([{ text: `Le tableau : ${SHEET}`, at: 1 }, { text: "Google Sheets est ouvert.", at: 2 }]).map((d) => d.usedAt), [1]);
});
