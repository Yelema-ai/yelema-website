import { test } from "node:test";
import assert from "node:assert/strict";
import { commandsOf, filterCommands, missingFor } from "./expert-commands.ts";

test("an Expert's own commands come before the shared ones", () => {
  const list = commandsOf("kouassi");
  assert.ok(list.length > 10);
  const firstShared = list.findIndex((c) => c.common);
  assert.ok(list.slice(0, firstShared).some((c) => c.cmd === "devis"));
  assert.ok(list.slice(firstShared).every((c) => c.common));
});

test("found by first name when the catalogue key is a job", () => {
  assert.ok(commandsOf("commercial-ventes", "Kouassi").some((c) => c.cmd === "prospects"));
  assert.deepEqual(commandsOf("inconnu", "Personne"), []);
});

test("filter by command name, then by a word of its name", () => {
  const list = commandsOf("kouassi");
  assert.equal(filterCommands(list, "de")[0].cmd, "devis");
  assert.ok(filterCommands(list, "mail").some((c) => c.cmd === "email"));
});

test("what a command still needs", () => {
  const devis = commandsOf("kouassi").find((c) => c.cmd === "devis")!;
  assert.equal(missingFor(devis, "", false), "le client");
  assert.equal(missingFor(devis, "Sotra", false), null);
  const resume = commandsOf("kouassi").find((c) => c.cmd === "resume")!;
  assert.equal(missingFor(resume, "", true), null);
  const point = commandsOf("kouassi").find((c) => c.cmd === "point")!;
  assert.equal(missingFor(point, "", false), null);
});
