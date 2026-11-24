import assert from "node:assert/strict";
import { test } from "node:test";
import { seatFolderOf } from "./drive-paths.ts";

test("chat d'entreprise : seul un dossier d'agent u-… en tête est reconnu", () => {
  assert.equal(seatFolderOf(["u-abc123", "Notes"]), "u-abc123");
  for (const parts of [["Djeneba"], ["Notes", "u-abc123"], ["u-ABC123"], ["u-abc12"], []]) assert.equal(seatFolderOf(parts), undefined, parts.join("/"));
});

test("drivePathFault : seul un chemin du lecteur passe", async () => {
  const { drivePathFault } = await import("./drive-paths.ts");
  for (const ok of ["~/Livrables", "~/Livrables/Awa/devis.pdf", "/home/node/Livrables/a b/c.docx"]) assert.equal(drivePathFault(ok), null, ok);
  for (const out of ["~/.hermes/config.yaml", "~/.yelema/voix/brief.json", "/etc/passwd", "~/LivrablesX/a", "Livrables/a", "", "/home/node/.ssh/id_rsa"]) assert.equal(drivePathFault(out), "outside", out);
  for (const bad of ["~/Livrables/../.hermes/.env", "~/Livrables/./a", "/home/node/Livrables/a/../../.yelema/x"]) assert.equal(drivePathFault(bad), "invalid", bad);
});
