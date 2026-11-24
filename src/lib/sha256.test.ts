import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { sha256Hex } from "./sha256.ts";

test("sha256Hex : même empreinte que node:crypto, toutes longueurs de bourrage", () => {
  const texts = ["", "abc", "a@b.c", "é".repeat(31), ...Array.from({ length: 140 }, (_, n) => "x".repeat(n)), "y".repeat(10_000)];
  for (const t of texts) assert.equal(sha256Hex(t), createHash("sha256").update(t).digest("hex"), `longueur ${t.length}`);
});
