import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createSessionsStore, type SpaceData } from "./sessions-store.ts";

const space = (id: string): SpaceData => ({ sessions: [{ session_id: id, title: id, last_active: 1 }], runs: [] });

function harness(answer: (agentId: string, profiles: string[]) => Record<string, SpaceData> | Promise<Record<string, SpaceData>>) {
  let t = 1000;
  const calls: string[] = [];
  const later: (() => void)[] = [];
  const store = createSessionsStore({
    readMany: async (agentId, profiles) => {
      calls.push(`${agentId}:${profiles.join(",")}`);
      return answer(agentId, profiles);
    },
    now: () => t,
    defer: (fn) => void later.push(fn),
  });
  const tick = async () => {
    while (later.length) later.shift()!();
    await new Promise((r) => setImmediate(r));
  };
  return { store, calls, tick, advance: (ms: number) => void (t += ms) };
}

describe("sessions store", () => {
  it("reads asked in the same tick leave as one grouped call per instance; a read in flight is shared", async () => {
    const h = harness((_a, ps) => Object.fromEntries(ps.map((p) => [p, space(p || "home")])));
    const all = Promise.all([h.store.read("a", ""), h.store.read("a", "x"), h.store.read("a", "y"), h.store.read("a", "x"), h.store.read("b", "z")]);
    await h.tick();
    const got = await all;
    assert.deepEqual(h.calls, ["a:,x,y", "b:z"]);
    assert.equal(got[1], got[3]);
    assert.equal(got[0].sessions[0].session_id, "home");
  });

  it("a fresh space is served from memory; past its age it is read again", async () => {
    const h = harness((_a, ps) => Object.fromEntries(ps.map((p) => [p, space(p)])));
    const first = h.store.read("a", "x", 30_000);
    await h.tick();
    await first;
    await h.store.read("a", "x", 30_000);
    assert.equal(h.calls.length, 1);
    h.advance(30_000);
    const again = h.store.read("a", "x", 30_000);
    await h.tick();
    await again;
    assert.equal(h.calls.length, 2);
  });

  it("put seeds a fresh reading: no call (the page's first screen, the bootstrap)", async () => {
    const h = harness(() => ({}));
    h.store.put("a", "x", space("seed"));
    const got = await h.store.read("a", "x");
    assert.equal(got.sessions[0].session_id, "seed");
    assert.equal(h.calls.length, 0);
  });

  it("a space missing from the answer fails; a failure is not kept", async () => {
    let fail = true;
    const h = harness((_a, ps) => (fail ? {} : Object.fromEntries(ps.map((p) => [p, space(p)]))));
    const p = assert.rejects(h.store.read("a", "x"));
    await h.tick();
    await p;
    fail = false;
    const q = h.store.read("a", "x");
    await h.tick();
    assert.equal((await q).sessions[0].session_id, "x");
  });

  it("an event re-reads only the spaces shown, in one call; the others are read when next asked", async () => {
    const h = harness((_a, ps) => Object.fromEntries(ps.map((p) => [p, space(`${p}${h.calls.length}`)])));
    h.store.put("a", "x", space("x"));
    h.store.put("a", "y", space("y"));
    h.store.put("a", "z", space("z"));
    const heard: string[] = [];
    const offX = h.store.subscribe("a", "x", (d) => heard.push(d.sessions[0].session_id));
    const offY = h.store.subscribe("a", "y", (d) => heard.push(d.sessions[0].session_id));
    h.store.invalidate("a");
    await h.tick();
    await h.tick();
    assert.deepEqual(h.calls, ["a:x,y"]);
    assert.deepEqual(heard.sort(), ["x1", "y1"]);
    // z was marked stale: its next read goes out although it is young.
    const z = h.store.read("a", "z");
    await h.tick();
    await z;
    assert.deepEqual(h.calls, ["a:x,y", "a:z"]);
    // One profile only.
    h.store.invalidate("a", "x");
    await h.tick();
    await h.tick();
    assert.equal(h.calls.at(-1), "a:x");
    offX();
    offY();
  });

  it("stays bounded: spaces nobody shows go past the cap, listeners leave nothing behind", async () => {
    let t = 0;
    const store = createSessionsStore({ readMany: async () => ({}), now: () => t++, defer: (fn) => fn() }, { maxSpaces: 10 });
    const off = store.subscribe("a", "kept", () => undefined);
    store.put("a", "kept", space("k"));
    for (let i = 0; i < 100; i++) store.put("a", `p${i}`, space(String(i)));
    assert.equal(store.size().entries, 10);
    assert.ok(store.get("a", "kept"), "a space on screen is never dropped");
    off();
    for (let i = 0; i < 100; i++) store.subscribe("a", `p${i}`, () => undefined)();
    assert.equal(store.size().listeners, 0);
  });

  it("splits more than 40 spaces into several calls", async () => {
    const h = harness((_a, ps) => Object.fromEntries(ps.map((p) => [p, space(p)])));
    const all = Promise.all(Array.from({ length: 45 }, (_, i) => h.store.read("a", `p${i}`)));
    await h.tick();
    await all;
    assert.equal(h.calls.length, 2);
  });
});
