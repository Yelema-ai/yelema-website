import assert from "node:assert/strict";
import { test } from "node:test";
import { paginate } from "./paginate.ts";

const list = Array.from({ length: 12 }, (_, i) => i + 1);

test("a page and its bounds", () => {
  assert.deepEqual(paginate(list, 2, 5), { items: [6, 7, 8, 9, 10], page: 2, pages: 3, from: 6, to: 10 });
  assert.deepEqual(paginate(list, 3, 5).items, [11, 12]);
});

test("the page is clamped into range", () => {
  assert.equal(paginate(list, 9, 5).page, 3);
  assert.equal(paginate(list, 0, 5).page, 1);
  assert.equal(paginate(list, Number.NaN, 5).page, 1);
});

test("an empty list is one empty page", () => {
  assert.deepEqual(paginate([], 4, 10), { items: [], page: 1, pages: 1, from: 0, to: 0 });
});

test("capGroups : les premières lignes dans l'ordre, le vrai total de chaque groupe, le reste compté", async () => {
  const { capGroups } = await import("./paginate.ts");
  const groups = [{ label: "a", rows: [1, 2, 3] }, { label: "b", rows: [4, 5, 6, 7] }, { label: "c", rows: [8] }];
  assert.deepEqual(capGroups(groups, 5), { groups: [{ label: "a", rows: [1, 2, 3], total: 3 }, { label: "b", rows: [4, 5], total: 4 }], hidden: 3 });
  assert.deepEqual(capGroups(groups, 100).hidden, 0);
  assert.equal(capGroups(groups, 100).groups.length, 3);
  assert.deepEqual(capGroups(groups, 0), { groups: [], hidden: 8 });
  assert.equal(groups[1].rows.length, 4, "la liste d'origine n'est pas modifiée");
});
