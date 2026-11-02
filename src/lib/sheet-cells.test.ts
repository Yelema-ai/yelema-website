import assert from "node:assert/strict";
import { test } from "node:test";
import { isNumberCell, isTotalRow } from "./sheet-cells.ts";

test("isNumberCell: amounts, percentages and plain numbers, not words or dates in words", () => {
  for (const v of ["1800000", "1 800 000", "3 150 000 FCFA", "-12,5 %", "€ 1,200.50", "(450)", "42"]) assert.equal(isNumberCell(v), true, v);
  for (const v of ["", "Stand 12 m²", "Total", "J-10", "12 rendez-vous", "N/A"]) assert.equal(isNumberCell(v), false, v);
});

test("isTotalRow: Total, Sous-total, Totaux on the first filled cell", () => {
  assert.equal(isTotalRow(["Total", "3150000"]), true);
  assert.equal(isTotalRow(["", "Sous-total", "12"]), true);
  assert.equal(isTotalRow(["TOTAUX", "1"]), true);
  assert.equal(isTotalRow(["Totalement neuf", "1"]), false);
  assert.equal(isTotalRow(["Stand", "1"]), false);
});
