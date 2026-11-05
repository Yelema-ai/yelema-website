import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createEventHub, eventStreamOn, matches, nextEvent, namedPings, parseInstanceEvent, reconnectDelay, resumeId, silenceMs, STREAM_SILENCE_MS, streamGate, touchesDrive, touchesSessions, type InstanceEvent, type InstanceEventType } from "./instance-events.ts";

const ev = (type: InstanceEventType, extra: Partial<InstanceEvent> = {}): InstanceEvent => ({ type, at: 1, ...extra });

const GW = { RUNTIME_GATEWAY_URL: "https://gw", RUNTIME_GATEWAY_TOKEN: "t".repeat(32) };

describe("instance event stream", () => {
  it("off unless EVENT_STREAM (or NEXT_PUBLIC_EVENT_STREAM) is on AND the gateway is set", () => {
    assert.equal(eventStreamOn({}), false);
    assert.equal(eventStreamOn(GW), false);
    assert.equal(eventStreamOn({ ...GW, EVENT_STREAM: "off" }), false);
    assert.equal(eventStreamOn({ EVENT_STREAM: "on" }), false);
    assert.equal(eventStreamOn({ ...GW, EVENT_STREAM: "on" }), true);
    assert.equal(eventStreamOn({ ...GW, NEXT_PUBLIC_EVENT_STREAM: " ON " }), true);
  });

  it("reconnects after 2 s, doubling up to 5 min, with jitter", () => {
    assert.equal(reconnectDelay(0, () => 0.5), 2_000);
    assert.equal(reconnectDelay(3, () => 0.5), 16_000);
    assert.equal(reconnectDelay(30, () => 0.5), 300_000);
    assert.equal(reconnectDelay(0, () => 0), 1_600);
    assert.equal(reconnectDelay(0, () => 1), 2_400);
  });

  it("hub: events reach the instance's listeners only; connected follows the stream", () => {
    const hub = createEventHub();
    const heard: string[] = [];
    const off = hub.on("a", (e) => heard.push(`a:${e.type}`));
    hub.on("b", (e) => heard.push(`b:${e.type}`));
    hub.emit("a", ev("turn.ended"));
    off();
    hub.emit("a", ev("files.changed"));
    assert.deepEqual(heard, ["a:turn.ended"]);
    assert.equal(hub.connected("a"), false);
    hub.setConnected("a", true);
    assert.equal(hub.connected("a"), true);
    hub.setConnected("a", false);
    assert.equal(hub.connected("a"), false);
  });

  it("nextEvent: resolves on the awaited kind, or on abort, and leaves no listener behind", async () => {
    const hub = createEventHub();
    const ctl = new AbortController();
    let woke = false;
    const p = nextEvent(hub, "a", "turn.ended", ctl.signal).then(() => (woke = true));
    hub.emit("a", ev("files.changed"));
    await new Promise((r) => setImmediate(r));
    assert.equal(woke, false);
    hub.emit("a", ev("turn.ended"));
    await p;
    assert.equal(woke, true);
    const aborted = new AbortController();
    const q = nextEvent(hub, "a", "turn.ended", aborted.signal);
    aborted.abort();
    await q;
  });
});

describe("events carry everything (contract §1)", () => {
  it("parses the known types with their fields; ignores an unknown type; keeps the type of a bad body", () => {
    assert.deepEqual(parseInstanceEvent("turn.ended", '{"type":"turn.ended","at":5,"profile":"c__fatima","session":"s1"}'), { type: "turn.ended", at: 5, profile: "c__fatima", session: "s1" });
    assert.deepEqual(parseInstanceEvent("job.done", '{"kind":"mcp"}', 9), { type: "job.done", at: 9, kind: "mcp" });
    assert.deepEqual(parseInstanceEvent("job.done", '{"kind":"rm -rf"}', 9), { type: "job.done", at: 9 });
    assert.deepEqual(parseInstanceEvent("files.changed", "not json", 3), { type: "files.changed", at: 3 });
    assert.deepEqual(parseInstanceEvent("sessions.changed", '{"profile":"../x"}', 3), { type: "sessions.changed", at: 3 });
    assert.equal(parseInstanceEvent("ready", "{}"), null);
    assert.equal(parseInstanceEvent("something.new", "{}"), null);
  });

  it("resume id: short and printable only", () => {
    assert.equal(resumeId("123-4"), "123-4");
    assert.equal(resumeId(""), null);
    assert.equal(resumeId("a b"), null);
    assert.equal(resumeId("x".repeat(129)), null);
    assert.equal(resumeId("a\nb"), null);
  });

  it("filters: type, kind, and an event without a profile concerns every profile", () => {
    assert.equal(matches(ev("job.done", { kind: "mcp" }), { types: ["job.done"], kind: "mcp" }), true);
    assert.equal(matches(ev("job.done", { kind: "llm" }), { types: ["job.done"], kind: "mcp" }), false);
    assert.equal(matches(ev("turn.ended", { profile: "a" }), { types: ["turn.ended"], profile: "b" }), false);
    assert.equal(matches(ev("turn.ended"), { types: ["turn.ended"], profile: "b" }), true);
    assert.equal(matches(ev("turn.ended", { profile: "b" }), { types: ["turn.ended"] }), true);
  });

  it("what each event touches: sessions, and the drive (a turn's end only until files.changed was heard)", () => {
    for (const t of ["turn.ended", "sessions.changed", "routine.ended", "instance.changed"] as const) assert.equal(touchesSessions(ev(t)), true);
    assert.equal(touchesSessions(ev("files.changed")), false);
    assert.equal(touchesSessions(ev("job.done", { kind: "mcp" })), false);
    assert.equal(touchesDrive(ev("files.changed"), true), true);
    assert.equal(touchesDrive(ev("turn.ended"), false), true);
    assert.equal(touchesDrive(ev("turn.ended"), true), false);
    assert.equal(touchesDrive(ev("instance.changed"), true), true);
    assert.equal(touchesDrive(ev("job.done", { kind: "mcp" }), false), false);
  });

  it("hub: listeners of every instance, connection changes heard, empty sets dropped", () => {
    const hub = createEventHub();
    const all: string[] = [];
    const offAll = hub.on(null, (e, id) => all.push(`${id}:${e.type}`));
    hub.emit("a", ev("job.done"));
    assert.deepEqual(all, ["a:job.done"]);
    assert.equal(hub.heard("a", "job.done"), true);
    assert.equal(hub.heard("a", "files.changed"), false);
    offAll();
    let changes = 0;
    const offLink = hub.onConnection(() => changes++);
    hub.setConnected("a", true);
    hub.setConnected("a", true);
    assert.equal(changes, 1);
    assert.equal(hub.connected(), true);
    assert.equal(hub.connected("b"), false);
    const gate = streamGate(hub, 20_000);
    assert.equal(gate.live(), true);
    assert.equal(gate.minMs, 20_000);
    hub.setConnected("a", false);
    assert.equal(gate.live(), false);
    offLink();
    // A poll of a team's instance keeps its net while the own one's stream is up.
    hub.setConnected("a", true);
    assert.equal(streamGate(hub, 15_000, "b").live(), false);
    assert.equal(streamGate(hub, 15_000, ["a", "b"]).live(), false);
    assert.equal(streamGate(hub, 15_000, ["a"]).live(), true);
    hub.setConnected("a", false);
    // A thousand watches come and go: nothing is left behind.
    for (let i = 0; i < 1000; i++) hub.on(`x${i}`, () => undefined)();
    hub.setConnected("a", true);
    assert.equal(changes, 2);
  });

  it("nextEvent: a filter with a profile waits for that profile", async () => {
    const hub = createEventHub();
    let woke = false;
    const p = nextEvent(hub, "a", { types: ["turn.ended"], profile: "x" }, new AbortController().signal).then(() => (woke = true));
    hub.emit("a", ev("turn.ended", { profile: "y" }));
    await new Promise((r) => setImmediate(r));
    assert.equal(woke, false);
    hub.emit("a", ev("turn.ended", { profile: "x" }));
    await p;
  });
});

describe("heartbeat", () => {
  it("the gateway's `: ping` comments become `ping` frames, whatever the chunking; the rest passes as is", async () => {
    const input = ["retry: 5000\nevent: ready\ndata: {}\n\n: pi", "ng\n\nevent: turn.ended\nid: 7\ndata: {}\n\n: ping\r\n\r\n"];
    const out = await new Response(
      new ReadableStream<string>({
        start(c) {
          input.forEach((x) => c.enqueue(x));
          c.close();
        },
      })
        .pipeThrough(namedPings())
        .pipeThrough(new TextEncoderStream())
    ).text();
    assert.equal(out, "retry: 5000\nevent: ready\ndata: {}\n\nevent: ping\ndata: {}\n\nevent: turn.ended\nid: 7\ndata: {}\n\nevent: ping\ndata: {}\n\n");
  });
});

describe("silence before reconnecting", () => {
  it("a connection that never pinged waits longer than one that did", () => {
    assert.equal(silenceMs(true), STREAM_SILENCE_MS);
    assert.ok(silenceMs(false) >= 2 * STREAM_SILENCE_MS);
  });
});

describe("parsing never marks an event as the tab's own catch-up", () => {
  it("resumed is not read from the wire", () => {
    assert.equal(parseInstanceEvent("instance.changed", JSON.stringify({ resumed: true }))?.resumed, undefined);
  });
});
