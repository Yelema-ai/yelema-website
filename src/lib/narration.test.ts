import { test } from "node:test";
import assert from "node:assert/strict";

test("an English working note between two tools is hidden, a French sentence stays", async () => {
  const { isEnglishNote, forTheMember } = await import("./narration.ts");
  for (const s of ["Now format headers and widths.", "Let me check the file.", "I'll add the rows now", "Next, upload the sheet."]) assert.equal(isEnglishNote(s), true, s);
  for (const s of ["Je prépare le tableau, une minute.", "Voici le pipeline des prospects.", "Je mets en forme les colonnes", "Revvo", "OK", ""]) assert.equal(isEnglishNote(s), false, s);
  assert.deepEqual(forTheMember(["Now format headers and widths.", "Je crée le Google Sheet.", " "]), ["Je crée le Google Sheet."]);
});
