import assert from "node:assert/strict";
import { test } from "node:test";
import { atMost, boundedCache, isThumbable, looksLikeImage, thumbWidth } from "./thumbs.ts";

test("seules les images ont une vignette, à une largeur de la liste", () => {
  assert.ok(isThumbable("~/Livrables/Koffi/affiche.PNG") && isThumbable("a/b.jpeg") && isThumbable("x.webp"));
  assert.ok(!isThumbable("logo.svg") && !isThumbable("page.html") && !isThumbable("rapport.pdf"));
  assert.equal(thumbWidth("300"), 480);
  assert.equal(thumbWidth("960"), 960);
  assert.equal(thumbWidth("1000"), 1600);
  assert.equal(thumbWidth("99999"), 1600);
  assert.equal(thumbWidth(null), 480);
  assert.equal(thumbWidth("abc"), 1600);
});

const buf = (n: number) => new Uint8Array(n);

test("cache borné : un seul calcul pour deux demandes simultanées, puis servi depuis la mémoire", async () => {
  const cache = boundedCache<Uint8Array>(1000, 60_000);
  let made = 0;
  const make = async () => (made++, buf(100));
  const [a, b] = await Promise.all([cache.get("k", make), cache.get("k", make)]);
  assert.equal(a, b);
  await cache.get("k", make);
  assert.equal(made, 1);
  assert.equal(cache.size, 100);
});

test("cache borné : les plus anciennes sortent au-delà de la taille, rien au-delà de la durée", async () => {
  let t = 0;
  const cache = boundedCache<Uint8Array>(250, 1000, () => t);
  let made = 0;
  const make = async () => (made++, buf(100));
  await cache.get("a", make);
  await cache.get("b", make);
  await cache.get("c", make);
  assert.equal(cache.size, 200);
  await cache.get("b", make);
  assert.equal(made, 3);
  await cache.get("a", make);
  assert.equal(made, 4);
  t = 5000;
  await cache.get("a", make);
  assert.equal(made, 5);
  await cache.get("trop", async () => buf(10_000));
  assert.ok(cache.size <= 250);
});

test("cache borné : un échec n'est pas gardé", async () => {
  const cache = boundedCache<Uint8Array>(1000, 60_000);
  await assert.rejects(cache.get("k", async () => Promise.reject(new Error("instance"))));
  assert.equal((await cache.get("k", async () => buf(5))).byteLength, 5);
});

test("🔒 une image se reconnaît à ses premiers octets, pas à son nom", () => {
  const bytes = (head: number[] | string, at = 0) => {
    const b = new Uint8Array(16);
    b.set(typeof head === "string" ? [...head].map((c) => c.charCodeAt(0)) : head, at);
    return b;
  };
  assert.ok(looksLikeImage(bytes([0xff, 0xd8, 0xff, 0xe0])));
  assert.ok(looksLikeImage(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])));
  assert.ok(looksLikeImage(bytes("GIF89a")) && looksLikeImage(bytes("BM")));
  const webp = bytes("RIFF");
  webp.set([..."WEBP"].map((c) => c.charCodeAt(0)), 8);
  assert.ok(looksLikeImage(webp));
  assert.ok(looksLikeImage(bytes("ftypavif", 4)));
  assert.ok(looksLikeImage(bytes([0x49, 0x49, 0x2a, 0x00])) && looksLikeImage(bytes([0x4d, 0x4d, 0x00, 0x2a])));
  assert.ok(!looksLikeImage(bytes("<svg xmlns=")) && !looksLikeImage(bytes("<!doctype html")) && !looksLikeImage(bytes("%PDF-1.7")));
  assert.ok(!looksLikeImage(new Uint8Array([0xff, 0xd8, 0xff])) && !looksLikeImage(bytes("RIFF")));
});

test("pas plus de tâches à la fois que la borne ; toutes finissent, même après un échec", async () => {
  const run = atMost(2);
  let now = 0;
  let peak = 0;
  const task = (fail = false) => async () => {
    peak = Math.max(peak, ++now);
    await new Promise((r) => setTimeout(r, 5));
    now--;
    if (fail) throw new Error("raté");
    return 1;
  };
  const done = await Promise.allSettled([run(task()), run(task(true)), run(task()), run(task()), run(task())]);
  assert.equal(peak, 2);
  assert.deepEqual(done.map((d) => d.status), ["fulfilled", "rejected", "fulfilled", "fulfilled", "fulfilled"]);
});
