import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { LIVE_NET_MS, RECENT_RUN_MS, startPoll, type PollEnv } from "./poll.ts";

function fakeEnv() {
  let t = 0;
  let hidden = false;
  let seq = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const listeners = new Set<() => void>();
  const env: PollEnv = {
    setTimeout: (fn, ms) => {
      const id = ++seq;
      timers.set(id, { at: t + ms, fn });
      return id;
    },
    clearTimeout: (h) => void timers.delete(h as number),
    hidden: () => hidden,
    onVisibility: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    now: () => t,
  };
  const flush = () => new Promise((r) => setImmediate(r));
  return {
    env,
    async advance(ms: number) {
      const end = t + ms;
      await flush();
      for (;;) {
        const next = [...timers.entries()].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > end) break;
        t = next[1].at;
        timers.delete(next[0]);
        next[1].fn();
        await flush();
      }
      t = end;
      await flush();
    },
    async setHidden(h: boolean) {
      hidden = h;
      for (const l of listeners) l();
      await flush();
    },
    pending: () => timers.size,
    flush,
  };
}

describe("usePoll (logique)", () => {
  it("tourne à intervalle régulier, une fois au départ", async () => {
    const f = fakeEnv();
    let runs = 0;
    startPoll(() => void runs++, { everyMs: 1000 }, f.env);
    await f.flush();
    assert.equal(runs, 1);
    await f.advance(3000);
    assert.equal(runs, 4);
  });

  it("rien onglet caché, un seul appel au retour", async () => {
    const f = fakeEnv();
    let runs = 0;
    startPoll(() => void runs++, { everyMs: 1000 }, f.env);
    await f.flush();
    await f.setHidden(true);
    await f.advance(10_000);
    assert.equal(runs, 1);
    assert.equal(f.pending(), 0);
    await f.setHidden(false);
    assert.equal(runs, 2);
    await f.setHidden(true);
    await f.setHidden(false);
    assert.equal(runs, 2, "retour rapide : pas dû, pas de nouvel appel");
  });

  it("s'espace jusqu'au plafond, et reset revient au premier délai", async () => {
    const f = fakeEnv();
    const at: number[] = [];
    const p = startPoll(() => void at.push(f.env.now()), { everyMs: 1000, factor: 2, maxMs: 4000 }, f.env);
    await f.advance(15_000);
    assert.deepEqual(at, [0, 2000, 6000, 10_000, 14_000]);
    p.reset();
    await f.advance(1000);
    assert.equal(at.at(-1), 16_000);
  });

  it("s'arrête à l'échéance, et stop arrête tout", async () => {
    const f = fakeEnv();
    let runs = 0;
    startPoll(() => void runs++, { everyMs: 1000, deadlineMs: 2500 }, f.env);
    await f.advance(10_000);
    assert.equal(runs, 3);
    const g = fakeEnv();
    let other = 0;
    const p = startPoll(() => void other++, { everyMs: 1000 }, g.env);
    p.stop();
    await g.advance(5000);
    assert.equal(other, 1);
  });

  it("un seul appel à la fois", async () => {
    const f = fakeEnv();
    let runs = 0;
    let release: () => void = () => {};
    const p = startPoll(() => {
      runs++;
      return new Promise<void>((r) => (release = r));
    }, { everyMs: 1000 }, f.env);
    p.kick();
    p.kick();
    assert.equal(runs, 1);
    release();
    await f.flush();
  });
});

function fakeGate(minMs?: number) {
  let up = false;
  const subs = new Set<() => void>();
  return {
    gate: { live: () => up, onChange: (fn: () => void) => (subs.add(fn), () => void subs.delete(fn)), minMs },
    set(v: boolean) {
      up = v;
      for (const fn of subs) fn();
    },
    subs,
  };
}

describe("relecture branchée sur le flux", () => {
  it("flux branché : seulement le filet lent après la première lecture ; un événement (kick) lit quand même", async () => {
    const f = fakeEnv();
    const g = fakeGate();
    g.set(true);
    let runs = 0;
    const p = startPoll(() => void runs++, { everyMs: 1000, gate: g.gate }, f.env);
    await f.flush();
    assert.equal(runs, 1, "la première lecture part toujours");
    await f.advance(LIVE_NET_MS - 1);
    assert.equal(runs, 1);
    await f.advance(1);
    assert.equal(runs, 2, "un flux à moitié ouvert ne laisse pas l'écran figé");
    await f.advance(60 * 60_000);
    assert.equal(runs, 14);
    p.kick();
    await f.flush();
    assert.equal(runs, 15);
    p.stop();
    assert.equal(g.subs.size, 0, "désabonné à l'arrêt");
  });

  it("flux coupé : filet à 15 s au moins, un délai entier après la coupure ; rebranché : arrêté", async () => {
    const f = fakeEnv();
    const g = fakeGate();
    let runs = 0;
    startPoll(() => void runs++, { everyMs: 2000, gate: g.gate }, f.env);
    await f.flush();
    await f.advance(14_999);
    assert.equal(runs, 1, "2 s demandées, 15 s au moins");
    await f.advance(1);
    assert.equal(runs, 2);
    g.set(true);
    await f.advance(120_000);
    assert.equal(runs, 2);
    g.set(false);
    assert.equal(runs, 2, "pas de rafale à la coupure : la prochaine lecture attend son tour");
    await f.advance(15_000);
    assert.equal(runs, 3);
  });

  it("un filet long garde son délai ; jamais onglet caché ; au retour, une lecture s'il est dû, flux ou non", async () => {
    const f = fakeEnv();
    const g = fakeGate(60_000);
    let runs = 0;
    startPoll(() => void runs++, { everyMs: 600_000, gate: g.gate }, f.env);
    await f.flush();
    await f.advance(599_999);
    assert.equal(runs, 1);
    await f.setHidden(true);
    await f.advance(3_600_000);
    assert.equal(runs, 1);
    g.set(true);
    await f.setHidden(false);
    assert.equal(runs, 2);
  });

  it("flux rebranché : le filet lent compte depuis la dernière lecture", async () => {
    const f = fakeEnv();
    const g = fakeGate();
    let runs = 0;
    startPoll(() => void runs++, { everyMs: 1000, gate: g.gate }, f.env);
    await f.flush();
    await f.advance(60_000);
    g.set(true);
    const after = runs;
    await f.advance(LIVE_NET_MS - 15_000 - 1);
    assert.equal(runs, after);
    await f.advance(15_001);
    assert.equal(runs, after + 1);
  });

  it("runOnShow : au retour d'un onglet de connexion, une lecture tout de suite", async () => {
    const f = fakeEnv();
    let runs = 0;
    startPoll(() => void runs++, { everyMs: 30_000, immediate: false, runOnShow: true }, f.env);
    await f.setHidden(true);
    await f.advance(1000);
    await f.setHidden(false);
    assert.equal(runs, 1);
  });
});

describe("filet borné et rattrapage", () => {
  it("liveMs borne le filet pendant que le flux est branché", async () => {
    const f = fakeEnv();
    const g = fakeGate(150_000);
    g.set(true);
    let runs = 0;
    startPoll(() => void runs++, { everyMs: 150_000, gate: { ...g.gate, liveMs: 150_000 } }, f.env);
    await f.flush();
    assert.equal(runs, 1);
    await f.advance(150_000);
    assert.equal(runs, 2, "150 s, pas 5 min");
  });

  it("un rattrapage ne relance pas une lecture qui vient de partir ; plus tard, si", async () => {
    const f = fakeEnv();
    let runs = 0;
    const p = startPoll(() => void runs++, { everyMs: 600_000 }, f.env);
    await f.flush();
    p.catchUp();
    await f.flush();
    assert.equal(runs, 1);
    await f.advance(RECENT_RUN_MS);
    p.catchUp();
    await f.flush();
    assert.equal(runs, 2);
  });
});
