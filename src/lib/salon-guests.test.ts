import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_GUEST_DAYS, guestFormError, isGuestDays, MAX_GUEST_EMAILS, parseGuestEmails, presentGuests, type SalonGuest } from "./salon-guests.ts";

test("formulaire d'invitation : adresses séparées par virgules, points-virgules ou lignes, sans doublon", () => {
  assert.deepEqual(parseGuestEmails("Jean.Paul@Exemple.com, lad@exemple.org;\nmims@exemple.org jean.paul@exemple.com"), {
    emails: ["jean.paul@exemple.com", "lad@exemple.org", "mims@exemple.org"],
    invalid: [],
  });
  assert.deepEqual(parseGuestEmails("ok@exemple.com pas-une-adresse @x.y").invalid, ["pas-une-adresse", "@x.y"]);
});

test("formulaire d'invitation : refus en français, durée 30/90/180, 90 par défaut", () => {
  assert.equal(DEFAULT_GUEST_DAYS, 90);
  assert.equal(guestFormError("", 90), "Saisissez au moins une adresse e-mail.");
  assert.match(guestFormError("a@b", 90)!, /^Adresse invalide : a@b$/);
  assert.match(guestFormError("x@exemple.com", 60)!, /30, 90 ou 180 jours/);
  assert.equal(guestFormError("x@exemple.com", 30), null);
  assert.equal(guestFormError("x@exemple.com", "90"), "Choisissez une durée d’accès : 30, 90 ou 180 jours.");
  const many = Array.from({ length: MAX_GUEST_EMAILS + 1 }, (_, i) => `p${i}@exemple.com`).join(" ");
  assert.match(guestFormError(many, 90)!, /au plus/);
  assert.equal(isGuestDays(180), true);
});

test("bandeau : seuls les invités qui peuvent encore entrer comptent", () => {
  const g = (status: SalonGuest["status"]): SalonGuest => ({ id: status, email: "a@b.c", status, expiresAt: "", acceptedAt: null, invitedBy: null, invitedAt: "" });
  assert.deepEqual(presentGuests([g("invited"), g("active"), g("expired"), g("revoked")]).map((x) => x.id), ["invited", "active"]);
});
