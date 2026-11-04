import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

// Un effet écrit en expression renvoie la valeur de l'appel : scrollIntoView, focus, play… renvoient (ou renverront)
// une promesse, que React prend pour un nettoyage et appelle au démontage (« i is not a function », 04/11).
const ROOT = path.join(import.meta.dirname, "..");
const BAD = /use(Layout)?Effect\(\(\) => (?!\{|\(\) =>|void )[^\n]*\.(scrollIntoView|scrollTo|scrollBy|focus|play|requestFullscreen|showPicker|animate)\(/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(n) ? [p] : [];
  });
}

test("aucun effet ne renvoie la valeur d'une méthode du DOM", () => {
  const found = files(ROOT).flatMap((f) => readFileSync(f, "utf8").split("\n").map((l, i) => (BAD.test(l) ? `${path.relative(ROOT, f)}:${i + 1}` : null)).filter((x): x is string => x !== null));
  assert.deepEqual(found, []);
});
