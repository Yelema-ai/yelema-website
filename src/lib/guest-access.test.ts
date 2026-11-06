import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { clientIp, DEVICE_LIMIT, guestCookieApplies, guestCookieKey, guestCookieName, guestCookieOptions, guestDeliverables, guestDirectory, guestFileHref, guestRefusal, guestView, openGuestCookie, sealGuestCookie, rateWindow, sameOriginPost } from "./guest-access.ts";
import { salonDeliverableFor } from "./salon-deliverables.ts";

const headers = (h: Record<string, string>) => ({ get: (n: string) => h[n.toLowerCase()] ?? null });
const NOW = Date.parse("2026-11-05T12:00:00Z");
const DAY = 86_400;

test("cookie invité : HttpOnly, SameSite=Lax, chemin /invite, Secure en production", () => {
  const o = guestCookieOptions("2027-06-01T00:00:00Z", NOW, true)!;
  assert.deepEqual({ ...o, maxAge: undefined }, { httpOnly: true, secure: true, sameSite: "lax", path: "/invite", maxAge: undefined });
  assert.equal(guestCookieName(true), "__Secure-yelema_guest");
  assert.equal(guestCookieOptions("2027-06-01T00:00:00Z", NOW, false)!.secure, false);
});

test("cookie invité : 30 jours glissants, jamais au-delà de la fin de l'accès", () => {
  assert.equal(guestCookieOptions("2027-06-01T00:00:00Z", NOW, true)!.maxAge, 30 * DAY);
  assert.equal(guestCookieOptions("2026-11-08T12:00:00Z", NOW, true)!.maxAge, 3 * DAY);
  assert.equal(guestCookieOptions("2026-11-05T11:59:59Z", NOW, true), null);
  assert.equal(guestCookieOptions("pas une date", NOW, true), null);
});

const KEY = guestCookieKey("resolver-token-0123456789abcdef")!;
const SECRET = "ab".repeat(32);
const SESSION = "sess_0123456789abcdef";

test("cookie invité : scellé (AES-GCM), lié à l'invitation qui l'a ouvert", () => {
  const raw = sealGuestCookie(KEY, { session: SESSION, secret: SECRET }, "tok_AAAAAAAAAAAAAAAAAAAA");
  assert.deepEqual(openGuestCookie(KEY, raw), { session: SESSION, secret: SECRET });
  assert.deepEqual(openGuestCookie(KEY, raw, "tok_AAAAAAAAAAAAAAAAAAAA"), { session: SESSION, secret: SECRET });
  assert.equal(openGuestCookie(KEY, raw, "tok_BBBBBBBBBBBBBBBBBBBB"), null);
  assert.equal(openGuestCookie(KEY, "n'importe quoi"), null);
  assert.equal(openGuestCookie(KEY, undefined), null);
  // Neither the key, the session nor the link can be read from it.
  const bytes = Buffer.from(raw, "base64url").toString("latin1");
  for (const s of [SECRET, SESSION, "tok_AAAA"]) assert.ok(!bytes.includes(s) && !raw.includes(s), s);
  assert.equal(guestCookieKey(undefined), null);
  assert.equal(guestCookieKey("court"), null);
});

test("cookie invité : altéré, ou scellé par une autre clé, il est refusé", () => {
  const raw = sealGuestCookie(KEY, { session: SESSION, secret: SECRET }, "tok_AAAAAAAAAAAAAAAAAAAA");
  const buf = Buffer.from(raw, "base64url");
  for (const i of [0, 13, buf.length - 1]) {
    const bad = Buffer.from(buf);
    bad[i] ^= 1;
    assert.equal(openGuestCookie(KEY, bad.toString("base64url")), null, `octet ${i}`);
  }
  assert.equal(openGuestCookie(guestCookieKey("autre-jeton-0123456789abcdef")!, raw), null);
  // The old, readable format is no longer a session.
  assert.equal(openGuestCookie(KEY, Buffer.from(JSON.stringify({ s: SESSION, t: "x" })).toString("base64url")), null);
  // Two seals of the same content differ (fresh IV).
  assert.notEqual(raw, sealGuestCookie(KEY, { session: SESSION, secret: SECRET }, "tok_AAAAAAAAAAAAAAAAAAAA"));
});

test("le cookie invité n'atteint aucune route des membres", () => {
  for (const p of ["/invite", "/invite/abc", "/invite/session", "/invite/salon/livrables"]) assert.equal(guestCookieApplies(p), true, p);
  for (const p of ["/", "/echanges", "/api/buzz", "/api/buzz/salons/x/livrables", "/inviter", "/invitex/a", "/api/invite"]) assert.equal(guestCookieApplies(p), false, p);
});

test("CSRF : un POST d'un autre site est refusé", () => {
  const json = { "content-type": "application/json" };
  assert.equal(sameOriginPost(headers({ ...json, "sec-fetch-site": "same-origin" })), true);
  assert.equal(sameOriginPost(headers({ ...json, "sec-fetch-site": "cross-site" })), false);
  assert.equal(sameOriginPost(headers({ ...json, "sec-fetch-site": "same-site" })), false);
  assert.equal(sameOriginPost(headers({ ...json, origin: "https://acme.app.yelema.ai", host: "acme.app.yelema.ai" })), true);
  assert.equal(sameOriginPost(headers({ ...json, origin: "https://evil.example", host: "acme.app.yelema.ai" })), false);
  assert.equal(sameOriginPost(headers({ ...json, origin: "https://autre.app.yelema.ai", "x-forwarded-host": "acme.app.yelema.ai", host: "interne" })), false);
  assert.equal(sameOriginPost(headers({ ...json, host: "acme.app.yelema.ai" })), false);
  // A plain form post (text/plain, urlencoded) never passes, even same-origin.
  assert.equal(sameOriginPost(headers({ "content-type": "application/x-www-form-urlencoded", "sec-fetch-site": "same-origin" })), false);
});

test("limite par adresse IP : au-delà, refus avec délai, puis une nouvelle fenêtre", () => {
  const hit = rateWindow(2, 60_000);
  assert.deepEqual(hit("1.2.3.4", 0), { ok: true });
  assert.deepEqual(hit("1.2.3.4", 1), { ok: true });
  assert.deepEqual(hit("1.2.3.4", 30_000), { ok: false, retryAfter: 30 });
  assert.deepEqual(hit("5.6.7.8", 30_000), { ok: true });
  assert.deepEqual(hit("1.2.3.4", 60_000), { ok: true });
});

test("adresse du visiteur : celle du saut de confiance, jamais l'entrée de gauche écrite par le client", () => {
  // Vercel : son propre x-real-ip ; un X-Forwarded-For inventé n'y change rien.
  assert.equal(clientIp(headers({ "x-real-ip": "41.1.1.1", "x-forwarded-for": "6.6.6.6, 41.1.1.1" }), true), "41.1.1.1");
  assert.equal(clientIp(headers({ "x-forwarded-for": "6.6.6.6" }), true), "");
  // Ailleurs : l'entrée ajoutée par le mandataire le plus proche.
  assert.equal(clientIp(headers({ "x-forwarded-for": "6.6.6.6, 41.202.1.2", "x-real-ip": "7.7.7.7" }), false), "41.202.1.2");
  assert.equal(clientIp(headers({ "x-forwarded-for": "1.1.1.1, <script>" }), false), "");
});

test("accès terminé (410 access_ended) et session morte (401) font tomber la session", () => {
  assert.equal(guestRefusal(410, "access_ended"), "ended");
  assert.equal(guestRefusal(403, "access_ended"), "ended");
  assert.equal(guestRefusal(401, "unauthorized"), "signed_out");
  assert.equal(guestRefusal(400, "invalid_code"), null);
  assert.equal(guestRefusal(503, "unavailable"), null);
});

test("la vue de l'invité ne garde que ce que sa page lit (ni la session, ni le relais)", () => {
  const v = guestView({ session: "secret", expiresAt: "2027-01-01T00:00:00Z", guest: { id: "g1", email: "a@b.c", nom: "Jean Paul" }, salon: { id: "s1", nom: "Projet", channel: "c1" }, relay: { url: "wss://r" } } as never);
  assert.equal("session" in v, false);
  assert.equal("relay" in v, false);
  assert.deepEqual(v.salon, { id: "s1", nom: "Projet", channel: "c1" });
});

test("participants et livrables de l'invité au format des Échanges", () => {
  const dir = guestDirectory([
    { nom: "Leslie", type: "personne", cles: ["a"] },
    { nom: "Mamadou (de Leslie)", type: "expert", cles: ["b"] },
    { nom: "Jean Paul", type: "invite", cles: ["c"] },
  ]);
  assert.deepEqual(dir.map((e) => [e.type, e.membre]), [["personne", "Leslie"], ["expert", "Leslie"], ["invite", "Jean Paul"]]);
  const chan = "0b6f1c1e-0000-4000-8000-000000000001";
  const drivePath = `Livrables/Mamadou/Salons/${chan}/cr.pdf`;
  const items = guestDeliverables([{ name: "cr.pdf", path: "cr.pdf", drivePath, expert: "Mamadou", size: null, modifiedAt: "2026-11-05T10:00:00Z" }]);
  assert.equal(items[0].auteur, "Mamadou");
  assert.equal(items[0].url, `/invite/salon/fichier?p=${encodeURIComponent(drivePath).replace(/%20/g, "+")}`);
  assert.equal(guestFileHref(drivePath).includes("inst"), false, "jamais l'instance ni une adresse signée");
  assert.equal(salonDeliverableFor(`~/Livrables/Mamadou/Salons/${chan}/cr.pdf`, chan, items)?.id, `~/${drivePath}`);
});

test("deux appareils au plus : le refus du back-office est dit en clair ; ce navigateur garde sa clé", () => {
  assert.equal(DEVICE_LIMIT, "Vous êtes déjà connecté sur 2 appareils. Demandez à la personne qui vous a invité de déconnecter vos appareils.");
  const route = readFileSync(new URL("../app/invite/[token]/verify/route.ts", import.meta.url), "utf8");
  assert.match(route, /e\.code === "device_limit"\) return apiError\(DEVICE_LIMIT, 403, "device_limit"\)/);
  assert.match(route, /const kept = await guestCookie\(token\);\s+const secret = kept \? hexToBytes\(kept\.secret\) : generateSecretKey\(\);/);
});
