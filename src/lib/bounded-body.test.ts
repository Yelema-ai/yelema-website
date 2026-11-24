import assert from "node:assert/strict";
import { test } from "node:test";
import { boundedText, cappedText } from "./bounded-body.ts";

test("cappedText : s'arrête au plafond et annule le flux, sans lire la suite", async () => {
  let pulled = 0;
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    pull(c) {
      pulled++;
      c.enqueue(new TextEncoder().encode("a".repeat(1000)));
    },
    cancel() {
      cancelled = true;
    },
  }, { highWaterMark: 0 });
  const out = await cappedText({ body: body as Response["body"] }, 2500);
  assert.equal(out.text.length, 2500);
  assert.equal(out.cut, true);
  assert.equal(cancelled, true);
  assert.ok(pulled <= 4);
});

test("cappedText : un corps sous le plafond revient entier ; un caractère coupé en deux est retiré", async () => {
  assert.deepEqual(await cappedText(new Response("été"), 100), { text: "été", cut: false });
  assert.deepEqual(await cappedText(new Response(null), 100), { text: "", cut: false });
  assert.deepEqual(await cappedText(new Response("aé"), 2), { text: "a", cut: true });
});

test("cappedText marche aussi dans le navigateur (sans Buffer), un caractère à cheval sur deux morceaux reste entier", async () => {
  const bytes = new TextEncoder().encode("aé"); // « é » : deux octets
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(bytes.subarray(0, 2));
      c.enqueue(bytes.subarray(2));
      c.close();
    },
  });
  const saved = globalThis.Buffer;
  // @ts-expect-error: the browser has none
  delete globalThis.Buffer;
  try {
    assert.deepEqual(await cappedText({ body: body as Response["body"] }, 100), { text: "aé", cut: false });
  } finally {
    globalThis.Buffer = saved;
  }
});

test("boundedText : le corps entier sous la borne, null au-delà, même lu morceau par morceau", async () => {
  assert.equal(await boundedText(new Request("https://x.invalid", { method: "POST", body: "{\"é\":1}" }), 100), "{\"é\":1}");
  assert.equal(await boundedText(new Request("https://x.invalid", { method: "POST", body: "a".repeat(101) }), 100), null);
});
