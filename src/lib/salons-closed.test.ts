import assert from "node:assert/strict";
import test from "node:test";
import { closedSalons, SALONS_CLOSED, salonsNotOpen, salonsOfMe } from "./salons-closed.ts";

test("Salons pas encore ouverts : message calme, rien à réessayer", () => {
  const c = closedSalons("Le partage n’est pas encore ouvert pour cette entreprise.");
  assert.equal(c.title, "Les Salons arrivent bientôt");
  assert.equal(c.retry, false);
  assert.doesNotMatch(c.text, /partage/);
});

test("Le code salons_closed suffit, quel que soit le texte du back-office", () => {
  const c = closedSalons("Les Salons ne sont pas ouverts pour cette entreprise.", SALONS_CLOSED);
  assert.equal(c.title, "Les Salons arrivent bientôt");
  assert.equal(c.retry, false);
  assert.equal(salonsNotOpen("Les Salons ne sont pas ouverts pour cette entreprise.", "salons_closed"), true);
  assert.equal(salonsNotOpen("", "salons_closed"), true);
});

test("Accès en cours d'activation ou panne : on peut réessayer", () => {
  assert.equal(closedSalons("Votre accès aux Salons est en cours d’activation. Réessayez dans une minute.").retry, true);
  const other = closedSalons("Le relais ne répond pas.");
  assert.equal(other.retry, true);
  assert.equal(other.text, "Le relais ne répond pas.");
  assert.equal(closedSalons("Le relais ne répond pas.", "unavailable").retry, true);
});

test("Le menu ne cache les Salons que s'ils ne sont pas ouverts, jamais sur une panne", () => {
  assert.equal(salonsNotOpen("Le partage n’est pas encore ouvert pour cette entreprise."), true);
  assert.equal(salonsNotOpen("Le relais ne répond pas."), false);
  assert.equal(salonsNotOpen("Le relais ne répond pas.", "unavailable"), false);
  assert.equal(salonsNotOpen(undefined), false);
  assert.equal(salonsNotOpen(undefined, null), false);
});

test("/app/me : access.salons, sinon salons à la racine, sinon on ne sait pas", () => {
  assert.equal(salonsOfMe({ access: { salons: true } }), true);
  assert.equal(salonsOfMe({ access: { salons: false }, salons: true }), false);
  assert.equal(salonsOfMe({ access: "instance", salons: true }), true);
  assert.equal(salonsOfMe({ access: "entreprise", salons: false }), false);
  assert.equal(salonsOfMe({ access: { kind: "instance" }, salons: false }), false);
  assert.equal(salonsOfMe({ access: "instance" }), null);
  assert.equal(salonsOfMe({ salons: "oui" }), null);
  assert.equal(salonsOfMe(null), null);
  assert.equal(salonsOfMe(undefined), null);
});
