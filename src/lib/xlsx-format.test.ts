import { test } from "node:test";
import assert from "node:assert/strict";
import { applyTint, argbHex, colIndex, colWidthPx, formatNumber, rowHeightPx, rowIndex } from "./xlsx-format.ts";

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
