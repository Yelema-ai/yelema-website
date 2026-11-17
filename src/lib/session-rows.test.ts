import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseByProfile, railOf, runsOf, spaceProfile } from "./session-rows.ts";
import type { RunOutcome } from "./routines.ts";

const routineSession = (id: string, at: number) => ({ id: `cron_veille_${id}`, title: "Veille · Oct 16 09:00", preview: null, last_active: at, message_count: 2 });

describe("session rows", () => {
  it("the gateway's grouped answer, both shapes of each part; a bad profile or entry is left out", () => {
    const got = parseByProfile({
      data: {
        default: { sessions: { data: [{ id: "s1", title: "A", last_active: 2 }] }, routines: { outcomes: { r1: "sent", r2: "nope" } } },
        c__fatima: { sessions: [{ id: "s2" }, { nope: 1 }], routines: { r3: "silent" } },
        "../evil": { sessions: [] },
        broken: "x",
      },
    });
    assert.deepEqual([...got.keys()], ["default", "c__fatima"]);
    assert.deepEqual([...got.get("default")!.outcomes], [["r1", "sent"]]);
    assert.equal(got.get("c__fatima")!.sessions.length, 1);
    assert.equal(parseByProfile(null).size, 0);
    assert.equal(parseByProfile({ data: [] }).size, 0);
  });

  it("rail: a routine run only once it delivered; newest first", () => {
    const data = [{ id: "a", title: "Bonjour", last_active: 1 }, routineSession("r1", 3), routineSession("r2", 2), routineSession("r3", 4)];
    const outcomes = new Map<string, RunOutcome>([["cron_veille_r1", "sent"], ["cron_veille_r2", "silent"]]);
    const rail = railOf(data, outcomes);
    assert.deepEqual(rail.map((s) => s.session_id), ["cron_veille_r1", "a"]);
    assert.equal(rail[0].routine, "Veille");
    assert.equal(rail[1].routine, null);
  });

  it("runs: outcome known says silent or not; unknown is pending; capped", () => {
    const data = Array.from({ length: 30 }, (_, i) => routineSession(`r${i}`, i));
    const runs = runsOf([...data, { id: "chat", title: "Bonjour" }], new Map<string, RunOutcome>([["cron_veille_r29", "sent"], ["cron_veille_r28", "failed"]]));
    assert.equal(runs.length, 20);
    assert.deepEqual(runs[0], { session_id: "cron_veille_r29", routine: "Veille", last_active: 29, message_count: 2, silent: false });
    assert.equal(runs[1].silent, true);
    assert.equal(runs[2].pending, true);
  });

  it("the home space is keyed by an empty profile", () => {
    assert.equal(spaceProfile(null), "");
    assert.equal(spaceProfile("default"), "");
    assert.equal(spaceProfile("c__x"), "c__x");
  });
});
