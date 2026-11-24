import { test } from "node:test";
import assert from "node:assert/strict";
import { applyTint, argbHex, colIndex, colRange, colWidthPx, coverMerges, formatNumber, formulaRefs, MAX_FORMULA_REFS, rowHeightPx, rowIndex } from "./xlsx-format.ts";

const nb = (s: string) => s.replace(/[  ]/g, " ");

test("references, sizes and colours", () => {
  assert.equal(colIndex("A1"), 0);
  assert.equal(colIndex("AB12"), 27);
  assert.equal(rowIndex("C12"), 11);
  assert.equal(colWidthPx(undefined), 64);
  assert.equal(rowHeightPx(undefined), 20);
  assert.equal(argbHex("FFE30613"), "#E30613");
  assert.equal(argbHex("bad"), null);
  assert.equal(applyTint("#000000", 0.5), "#808080");
  assert.equal(applyTint("#FFFFFF", -0.5), "#808080");
});

test("number formats as Excel shows them, in French", () => {
  assert.equal(nb(formatNumber(12600000, "#,##0")), "12 600 000");
  assert.equal(nb(formatNumber(1234.5, "#,##0.00")), "1 234,50");
  assert.equal(nb(formatNumber(0.125, "0.0%")), "12,5 %");
  assert.equal(nb(formatNumber(1250, '#,##0 "FCFA"')), "1 250 FCFA");
  assert.equal(nb(formatNumber(-300, "#,##0;(#,##0)")), "(300)");
  assert.equal(formatNumber(46329, "dd/mm/yyyy"), "03/11/2026");
  assert.equal(nb(formatNumber(1500, null)), "1 500");
});

test("🔒 un classeur piégé ne fait pas tourner l'onglet : bornes prises sur la zone dessinée", () => {
  // <col min="-999999999">: from column 0, never a billion turns.
  assert.deepEqual(colRange("-999999999", "3", 26), [0, 2]);
  assert.deepEqual(colRange("1", "16384", 26), [0, 26]);
  assert.deepEqual(colRange(null, null, 26), [0, 0]);
  // A thousand overlapping merges over the whole area: the work stops at twice the area.
  const huge = Array.from({ length: 1000 }, () => ({ r0: 0, c0: 0, r1: 1_048_575, c1: 16_383 }));
  const { covered, spanAt } = coverMerges(huge, 300, 26);
  assert.equal(covered.size, 300 * 26 - 1);
  assert.deepEqual(spanAt.get("0:0"), { rowSpan: 300, colSpan: 26 });
  assert.equal(coverMerges([{ r0: 2, c0: 1, r1: 3, c1: 2 }], 9, 7).covered.size, 3);
  assert.equal(coverMerges([{ r0: 5, c0: 5, r1: 4, c1: 4 }], 9, 7).spanAt.size, 0);
});

test("formules simples : leurs plages lues, une liste démesurée refusée", () => {
  assert.deepEqual(formulaRefs("SUM($A$1:B3, c4)"), { fn: "SUM", refs: [["A1", "B3"], ["C4", "C4"]] });
  assert.equal(formulaRefs("VLOOKUP(A1,B1:C3,2)"), null);
  assert.equal(formulaRefs(`SUM(${Array(MAX_FORMULA_REFS + 1).fill("A1").join(",")})`), null);
  assert.ok(formulaRefs(`SUM(${Array(MAX_FORMULA_REFS).fill("A1").join(",")})`));
});

test("🔒 une couleur de diapositive qui n'est pas six chiffres hexadécimaux n'entre pas dans le CSS", () => {
  assert.equal(argbHex("fff url(https://evil.example/p.png)"), null);
  assert.equal(argbHex("000000;background:url(x)"), null);
  assert.equal(argbHex("1f4e79"), "#1F4E79");
});
