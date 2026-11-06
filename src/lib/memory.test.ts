import assert from "node:assert/strict";
import { test } from "node:test";
import { groupByUnit, isPublicId, orderUnits, type MemoryItem } from "./memory.ts";

test("units follow their parent, at its depth", () => {
  const u = (id: string, parent: string | null) => ({ id, name: id, parent });
  const out = orderUnits([u("rh", "dg"), u("dg", null), u("paie", "rh"), u("it", "dg")]);
  assert.deepEqual(out.map((o) => `${"-".repeat(o.depth)}${o.unit.id}`), ["dg", "-rh", "--paie", "-it"]);
  assert.equal(orderUnits([u("a", "x"), u("b", "c"), u("c", "b")]).length, 3);
});

test("only a plain public id reaches the back office's URL", () => {
  assert.equal(isPublicId("unt_1S0myuwggAVjZSUAu"), true);
  assert.equal(isPublicId("unt_1/../x"), false);
  assert.equal(isPublicId(""), false);
});

test("deposits grouped by compartment: the company first, then the units in order, empty ones left out", () => {
  const item = (id: string, unit: string | null) => ({ id, unit }) as MemoryItem;
  const units = [{ id: "rh", name: "RH" }, { id: "it", name: "IT" }, { id: "paie", name: "Paie" }];
  const groups = groupByUnit([item("1", "it"), item("2", null), item("3", "it"), item("4", "x")], units);
  assert.deepEqual(groups.map((g) => [g.name, g.items.map((i) => i.id)]), [["Toute l’entreprise", ["2"]], ["IT", ["1", "3"]], ["Département", ["4"]]]);
});

test("groupByUnit keepEmpty keeps every known unit, even empty", () => {
  const item = (id: string, unit: string | null) => ({ id, unit }) as MemoryItem;
  const units = [{ id: "it", name: "IT" }, { id: "rh", name: "RH" }];
  const groups = groupByUnit([item("1", "it")], units, true);
  assert.deepEqual(groups.map((g) => [g.name, g.items.length]), [["Toute l’entreprise", 0], ["IT", 1], ["RH", 0]]);
});
