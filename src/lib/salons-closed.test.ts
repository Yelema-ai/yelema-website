import assert from "node:assert/strict";
import test from "node:test";
import { closedSalons } from "./salons-closed.ts";

test("Salons pas encore ouverts : message calme, rien à réessayer", () => {
  const c = closedSalons("Le partage n’est pas encore ouvert pour cette entreprise.");
  assert.equal(c.title, "Les Salons arrivent bientôt");
  assert.equal(c.retry, false);
  assert.doesNotMatch(c.text, /partage/);
});

test("Accès en cours d'activation ou panne : on peut réessayer", () => {
  assert.equal(closedSalons("Votre accès aux Salons est en cours d’activation. Réessayez dans une minute.").retry, true);
  const other = closedSalons("Le relais ne répond pas.");
  assert.equal(other.retry, true);
  assert.equal(other.text, "Le relais ne répond pas.");
});
