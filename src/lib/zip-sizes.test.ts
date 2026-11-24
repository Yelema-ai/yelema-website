import assert from "node:assert/strict";
import { test } from "node:test";
import JSZip from "jszip";
import { inflatedBytes, openZip, zipSizes, zipTotalBytes } from "./zip-sizes.ts";

async function archive(parts: Record<string, string>, comment?: string): Promise<ArrayBuffer> {
  const zip = new JSZip();
  for (const [name, text] of Object.entries(parts)) zip.file(name, text);
  return zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE", comment });
}

test("🔒 taille décompressée de chaque partie, lue dans le répertoire du zip sans rien décompresser", async () => {
  const data = await archive({ "word/document.xml": "a".repeat(3_000_000), "xl/média/é.png": "xyz", "vide.xml": "" }, "un commentaire en fin d'archive");
  assert.ok(data.byteLength < 20_000, "l'archive est petite, son contenu ne l'est pas");
  const sizes = zipSizes(data);
  assert.equal(sizes.get("word/document.xml"), 3_000_000);
  assert.equal(sizes.get("xl/média/é.png"), 3);
  assert.equal(sizes.get("vide.xml"), 0);
  assert.equal(zipTotalBytes(data), 3_000_003);
});

test("🔒 une partie ouverte par jszip a sa taille ; une partie inconnue est refusée (Infinity)", async () => {
  const data = await archive({ "ppt/slides/slide1.xml": "b".repeat(1234) });
  const zip = await openZip((d) => JSZip.loadAsync(d), data);
  for (const name of Object.keys(zip.files).filter((n) => !zip.files[n].dir)) assert.equal(inflatedBytes(zip, name), 1234, name);
  assert.equal(inflatedBytes(zip, "absent.xml"), Infinity);
  assert.equal(inflatedBytes(await JSZip.loadAsync(data), "ppt/slides/slide1.xml"), Infinity, "archive non ouverte par openZip");
});

test("ce qui n'est pas un zip, ou un zip tronqué, ne donne aucune taille", async () => {
  assert.equal(zipSizes(new ArrayBuffer(0)).size, 0);
  assert.equal(zipSizes(new TextEncoder().encode("pas un zip du tout, mais assez long").buffer as ArrayBuffer).size, 0);
  const data = await archive({ "a.xml": "x".repeat(100) });
  assert.equal(zipSizes(data.slice(0, data.byteLength - 30)).size, 0);
});
