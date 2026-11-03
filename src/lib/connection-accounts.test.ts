import assert from "node:assert/strict";
import { test } from "node:test";
import { accountLabel, accountState, accountSummary, accountTitle, accountsBySlug, pinnedAccounts, splitAccounts, withAccountDetails } from "./connection-accounts.ts";
import type { IntegrationConnection } from "./types.ts";

const conn = (id: string, status: string, slug = "unipile", updatedAt = 0, isDisabled = false): IntegrationConnection => ({
  id,
  status,
  toolkitSlug: slug,
  updatedAt,
  isDisabled,
});

test("chaque compte a son état, une connexion inachevée ou en échec reste visible", () => {
  assert.equal(accountState(conn("a", "ACTIVE")), "active");
  assert.equal(accountState(conn("a", "initiated")), "pending");
  assert.equal(accountState(conn("a", "FAILED")), "failed");
  assert.equal(accountState(conn("a", "EXPIRED")), "failed");
  assert.equal(accountState(conn("a", "ACTIVE", "x", 0, true)), "disabled");
});

test("les doublons d'un outil sont tous listés, l'actif d'abord puis le plus récent", () => {
  const map = accountsBySlug([
    conn("ca_old", "ACTIVE", "unipile", 1),
    conn("ca_new", "ACTIVE", "Unipile", 5),
    conn("ca_stuck", "INITIATED", "unipile", 9),
    conn("ca_cal", "INITIATED", "googlecalendar", 2),
    conn("", "ACTIVE", "gmail"),
  ]);
  assert.deepEqual(map.get("unipile")?.map((c) => c.id), ["ca_new", "ca_old", "ca_stuck"]);
  assert.deepEqual(map.get("googlecalendar")?.map((c) => c.id), ["ca_cal"]);
  assert.equal(map.has("gmail"), false);
});

test("un compte se distingue par la fin de son identifiant", () => {
  assert.equal(accountLabel(conn("unipile_vino-hew", "ACTIVE"), 0), "Compte 1 · vino-hew");
  assert.equal(accountLabel(conn("ca_AbCdEf123456", "ACTIVE"), 1), "Compte 2 · Ef123456");
});

test("la carte d'un outil résume ses comptes, les connexions inachevées à part", () => {
  const list = [conn("a", "ACTIVE"), conn("b", "ACTIVE"), conn("c", "EXPIRED"), conn("d", "INITIATED"), conn("e", "INITIATED")];
  assert.equal(accountSummary(list), "3 comptes · 1 à reconnecter");
  assert.deepEqual(splitAccounts(list).unfinished.map((c) => c.id), ["d", "e"]);
  assert.equal(accountSummary([conn("a", "ACTIVE")]), "1 compte");
  assert.equal(accountSummary([conn("d", "INITIATED")]), "Connexion non terminée");
  assert.equal(accountSummary([]), "");
});

test("le nom d'un compte vient du back-office : libellé, sinon e-mail, sinon nom, sinon son rang", () => {
  const details = [
    { id: "ca_a", email: "awa@acme.ci", name: null, label: "Pro", isDefault: true, addedBy: { email: "awa@acme.ci", name: "Awa" } },
    { id: "ca_b", email: "awa.perso@gmail.com", name: null, label: null, isDefault: false, addedBy: null },
  ];
  const [a, b, c] = withAccountDetails([conn("ca_a", "ACTIVE", "gmail"), conn("ca_b", "ACTIVE", "gmail"), conn("ca_c", "ACTIVE", "gmail")], details);
  assert.equal(accountTitle(a!, 0), "Pro");
  assert.equal(a!.isDefault, true);
  assert.equal(accountTitle(b!, 1), "awa.perso@gmail.com");
  assert.equal(accountTitle(c!, 2), "Compte 3");
  assert.equal(c!.isDefault, undefined);
});

test("sans fiche au back-office, l'adresse lue chez Composio puis un alias choisi nomment le compte, jamais un alias tiré", () => {
  const details = [{ id: "ca_a", email: null, name: null, label: null, isDefault: false, addedBy: null }];
  const [a] = withAccountDetails([{ ...conn("ca_a", "ACTIVE", "gmail"), email: "compta@acme.ci" }], details);
  assert.equal(accountTitle(a!, 0), "compta@acme.ci");
  assert.equal(accountTitle({ ...conn("ca_b", "ACTIVE", "gmail"), alias: "Boîte compta" }, 1), "Boîte compta");
  assert.equal(accountTitle({ ...conn("ca_c", "ACTIVE", "gmail"), alias: "gmail-a1b2c3" }, 2), "Compte 3");
  assert.equal(accountTitle({ ...conn("ca_d", "ACTIVE", "gmail"), alias: "gmail-2" }, 3), "Compte 4");
});

test("le compte par défaut est épinglé seul, dans un ordre stable", () => {
  assert.deepEqual(pinnedAccounts({ slack: "ca_s", gmail: "ca_g" }), { gmail: ["ca_g"], slack: ["ca_s"] });
  assert.equal(JSON.stringify(pinnedAccounts({ slack: "ca_s", gmail: "ca_g" })), JSON.stringify(pinnedAccounts({ gmail: "ca_g", slack: "ca_s" })));
  assert.deepEqual(pinnedAccounts({}), {});
});
