import assert from "node:assert/strict";
import { test } from "node:test";
import { groupVariants, isSourceFolder } from "./visual-variants.ts";

test("visuals grouped by variant then format, picture first", () => {
  const names = ["261029_unifood_jmj_basique_story.pdf", "261029_unifood_jmj_basique_story.png", "261029_unifood_jmj_basique_carre.jpg", "261029_unifood_jmj_premium_story.png", "lisez-moi.txt"];
  const r = groupVariants(names.map((name) => ({ name })))!;
  assert.deepEqual(r.groups.map((g) => [g.variant, g.formats.map((f) => [f.format, f.files.map((x) => x.ext)])]), [
    ["basique", [["story", ["png", "pdf"]], ["carre", ["jpg"]]]],
    ["premium", [["story", ["png"]]]],
  ]);
  assert.equal(r.grouped.size, 4);
});

test("no grouping under two visuals, and the source folder is known", () => {
  assert.equal(groupVariants([{ name: "261029_a_b_c_d.png" }, { name: "x.png" }]), null);
  assert.ok(isSourceFolder("source") && isSourceFolder("Sources") && !isSourceFolder("sourcing"));
});
