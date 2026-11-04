import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { generateSecretKey } from "nostr-tools/pure";
import { BuzzConnection } from "./buzz-relay.ts";

// A relay that authenticates the browser, then goes silent: what a dropped connection looks like here.
class SilentRelay {
  static OPEN = 1;
  static last: SilentRelay | null = null;
  readyState = 1;
  closed = false;
  onmessage: ((m: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() {
    SilentRelay.last = this;
    queueMicrotask(() => this.onmessage?.({ data: JSON.stringify(["AUTH", "défi"]) }));
  }
  send(raw: string): void {
    const [type, auth] = JSON.parse(raw) as [string, { id: string }];
    if (type === "AUTH") queueMicrotask(() => this.onmessage?.({ data: JSON.stringify(["OK", auth.id, true, ""]) }));
  }
  close(): void {
    this.closed = true;
    this.readyState = 3;
  }
}

test("un relais muet : la requête échoue, la connexion est fermée et son propriétaire prévenu pour la rouvrir", async () => {
  (globalThis as { WebSocket?: unknown }).WebSocket = SilentRelay;
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const c = new BuzzConnection("wss://relais.test", generateSecretKey());
    const connecting = c.connect();
    await new Promise((r) => setImmediate(r));
    mock.timers.tick(0);
    await connecting;
    let dropped = 0;
    c.onclose = () => dropped++;
    const pending = c.query({ kinds: [9] });
    mock.timers.tick(15_000);
    await assert.rejects(pending, /ne répond pas/);
    assert.equal(dropped, 1);
    assert.equal(SilentRelay.last?.closed, true);
  } finally {
    mock.timers.reset();
  }
});
