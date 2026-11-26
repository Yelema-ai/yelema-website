import assert from "node:assert/strict";
import { test } from "node:test";

import { optimizable } from "./expert-image.ts";

test("une photo du catalogue Yelema passe par l'optimiseur", () => {
  assert.equal(optimizable("https://back-office-staging.yelema.ai/api/public/experts/awa/avatar-256.webp?v=1"), true);
  assert.equal(optimizable("https://back-office.yelema.ai/api/public/expert-avatars/42.webp"), true);
});

test("le back-office d'un client sensible est servi tel quel (adresse Tailscale refusée par l'optimiseur)", () => {
  assert.equal(optimizable("https://back-office.sensible-staging.yelema.ai/api/public/experts/awa/avatar-256.webp?v=1"), false);
  assert.equal(optimizable("https://back-office.sensible.yelema.ai/api/public/experts/awa/avatar-256.webp"), false);
});

test("un autre hôte, un autre chemin ou une adresse invalide restent hors de l'optimiseur", () => {
  assert.equal(optimizable("https://cdn.example.com/api/public/experts/awa.webp"), false);
  assert.equal(optimizable("http://back-office.yelema.ai/api/public/experts/awa.webp"), false);
  assert.equal(optimizable("https://back-office.yelema.ai/api/media/file/x.webp"), false);
  assert.equal(optimizable("https://sensibleco.yelema.ai/api/public/experts/awa.webp"), true);
  assert.equal(optimizable("pas une adresse"), false);
});
