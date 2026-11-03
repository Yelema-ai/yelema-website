import assert from "node:assert/strict";
import { test } from "node:test";
import type { RunOutcome } from "./routines.ts";
import { BATCH_MAX, DIRECT_READS, runOutcomes, type OutcomeReaders } from "./run-outcomes.ts";

const run = (n: number, done = true) => ({ id: `cron_${n}`, title: "Point", last_active: n, message_count: done ? 2 : 1 });
const runs = (count: number) => Array.from({ length: count }, (_, i) => run(i + 1));

function readers(outcome: (id: string) => RunOutcome | undefined, gateway = true) {
  const batches: string[][] = [];
  const reads: string[] = [];
  const r: OutcomeReaders = {
    batch: async (_a, _p, ids) => {
      if (!gateway) return null;
      batches.push(ids);
      return Object.fromEntries(ids.flatMap((id) => (outcome(id) ? [[id, outcome(id)!]] : [])));
    },
    one: async (_a, id) => {
      reads.push(id);
      const o = outcome(id);
      if (!o) throw new Error("unreadable");
      return o;
    },
  };
  return { r, batches, reads };
}

test("gateway: one call per profile, newest 60 unknown finished runs, known ones never asked again", async () => {
  const { r, batches, reads } = readers((id) => (id === "cron_70" ? "silent" : "sent"));
  const silent = runOutcomes(r).silent;
  const sessions = [...runs(80), run(81, false)];
  assert.deepEqual([...(await silent("a", "", sessions))], ["cron_70"]);
  assert.equal(batches.length, 1);
  assert.equal(batches[0].length, BATCH_MAX);
  assert.equal(batches[0][0], "cron_80");
  assert.ok(!batches[0].includes("cron_81"));
  await silent("a", "", sessions);
  assert.deepEqual(batches[1], Array.from({ length: 20 }, (_, i) => `cron_${20 - i}`));
  await silent("a", "", sessions);
  assert.equal(batches.length, 2);
  assert.equal(reads.length, 0);
});

test("the memo of outcomes is bounded, oldest out first", async () => {
  const { r, batches } = readers(() => "sent");
  const silent = runOutcomes(r, { memoMax: 3 }).silent;
  await silent("a", "", runs(3));
  await silent("b", "", runs(1));
  await silent("a", "", runs(3));
  assert.deepEqual(batches.at(-1), ["cron_3"]);
});

test("direct: at most 5 reads per request across profiles, failures left alone for 5 minutes", async () => {
  let t = 0;
  const { r, reads } = readers((id) => (id === "cron_10" ? undefined : "silent"), false);
  const silent = runOutcomes(r, { now: () => t }).silent;
  const budget = { left: DIRECT_READS };
  await Promise.all([silent("a", "?profile=x", runs(10), budget), silent("a", "?profile=y", runs(10), budget)]);
  assert.equal(reads.length, DIRECT_READS);
  assert.equal(reads[0], "cron_10");
  reads.length = 0;
  await silent("a", "?profile=x", runs(10));
  assert.ok(!reads.includes("cron_10"));
  assert.equal(reads.length, DIRECT_READS);
  t += 5 * 60_000;
  reads.length = 0;
  await silent("a", "?profile=x", runs(10));
  assert.ok(reads.includes("cron_10"));
});

test("a routine run is a conversation only once known to have delivered", async () => {
  const { r } = readers((id) => (id === "cron_1" ? "sent" : id === "cron_2" ? "silent" : id === "cron_3" ? "failed" : undefined));
  const { undelivered } = runOutcomes(r);
  const sessions = [run(1), run(2), run(3), run(4), run(5, false), { id: "s_6", title: "Ma question", last_active: 6, message_count: 2 }];
  assert.deepEqual([...(await undelivered("a", "", sessions))].sort(), ["cron_2", "cron_3", "cron_4", "cron_5"]);
});

test("a run the gateway does not know is read directly", async () => {
  const reads: string[] = [];
  const r: OutcomeReaders = {
    batch: async () => ({ cron_1: "sent" }),
    one: async (_a, id) => (reads.push(id), "silent"),
  };
  const { silent } = runOutcomes(r);
  assert.deepEqual([...(await silent("a", "", runs(2)))], ["cron_2"]);
  assert.deepEqual(reads, ["cron_2"]);
});

test("outcomes: only what is known, a run not read yet is missing", async () => {
  const { r } = readers((id) => (id === "cron_1" ? "sent" : id === "cron_2" ? "silent" : undefined));
  const known = await runOutcomes(r).outcomes("a", "", runs(3));
  assert.deepEqual([...known].sort(), [["cron_1", "sent"], ["cron_2", "silent"]]);
});
