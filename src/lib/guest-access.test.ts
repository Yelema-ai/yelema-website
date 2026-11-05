import assert from "node:assert/strict";
import { test } from "node:test";
import { clientIp, encodeGuestCookie, guestCookieApplies, guestCookieName, guestCookieOptions, guestDeliverables, guestDirectory, guestRefusal, guestSessionOf, guestView, rateWindow, sameOriginPost } from "./guest-access.ts";
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

test("cookie invité : la session ne vaut que pour l'invitation qui l'a ouverte", () => {
  const raw = encodeGuestCookie("sess_0123456789abcdef", "tok_AAAAAAAAAAAAAAAAAAAA");
  assert.equal(guestSessionOf(raw), "sess_0123456789abcdef");
  assert.equal(guestSessionOf(raw, "tok_AAAAAAAAAAAAAAAAAAAA"), "sess_0123456789abcdef");
  assert.equal(guestSessionOf(raw, "tok_BBBBBBBBBBBBBBBBBBBB"), null);
  assert.equal(guestSessionOf("n'importe quoi"), null);
  assert.equal(guestSessionOf(undefined), null);
  // The link itself never sits in the cookie.
  assert.ok(!Buffer.from(raw, "base64url").toString().includes("tok_AAAA"));
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

test("adresse du visiteur : le premier saut, rien d'autre", () => {
  assert.equal(clientIp(headers({ "x-forwarded-for": "41.202.1.2, 10.0.0.1" })), "41.202.1.2");
  assert.equal(clientIp(headers({ "x-forwarded-for": "<script>", "x-real-ip": "41.1.1.1" })), "41.1.1.1");
});

test("accès terminé (410 access_ended) et session morte (401) font tomber la session", () => {
  assert.equal(guestRefusal(410, "access_ended"), "ended");
  assert.equal(guestRefusal(403, "access_ended"), "ended");
  assert.equal(guestRefusal(401, "unauthorized"), "signed_out");
  assert.equal(guestRefusal(400, "invalid_code"), null);
  assert.equal(guestRefusal(503, "unavailable"), null);
});

test("la vue de l'invité ne garde que ce que sa page lit (jamais la session)", () => {
  const v = guestView({ session: "secret", expiresAt: "2027-01-01T00:00:00Z", guest: { id: "g1", email: "a@b.c", nom: "Jean Paul" }, salon: { id: "s1", nom: "Projet", channel: "c1" }, relay: { url: "wss://r" } } as never);
  assert.equal("session" in v, false);
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
  const items = guestDeliverables([{ name: "cr.pdf", path: `Livrables/Mamadou/Salons/${chan}/cr.pdf`, size: 10, modifiedAt: "2026-11-05T10:00:00Z", url: "https://x/f?sig=1" }]);
  assert.equal(items[0].auteur, "Mamadou");
  assert.equal(salonDeliverableFor(`~/Livrables/Mamadou/Salons/${chan}/cr.pdf`, chan, items)?.url, "https://x/f?sig=1");
});
