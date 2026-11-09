import assert from "node:assert/strict";
import { test } from "node:test";
import { accountChoice, accountNameOf, draftOf, revealsKey, pickCreate, pickPatch, splitList, triggerAccounts, triggerPayload, triggerRefusalMessage } from "./triggers.ts";

test("liste saisie : virgules, points-virgules ou lignes ; sans doublon ; 20 au plus", () => {
  assert.deepEqual(splitList(" a@x.ci, b@y.ci ;a@x.ci\n\nc "), ["a@x.ci", "b@y.ci", "c"]);
  assert.equal(splitList(Array.from({ length: 30 }, (_, i) => `k${i}`).join(",")).length, 20);
});

test("le filtre envoyé suit la source : adresses pour un mail, délai pour un rendez-vous", () => {
  const base = { ...draftOf(null), instruction: "Range la facture.", senders: "a@x.ci", domains: "orange.ci", keywords: "facture", leadMinutes: 30 };
  assert.deepEqual(triggerPayload({ ...base, source: "gmail" }), { body: { name: "Nouveau mail Gmail", instruction: "Range la facture.", filter: { senders: ["a@x.ci"], domains: ["orange.ci"], keywords: ["facture"] }, maxPerHour: 6 } });
  assert.deepEqual(triggerPayload({ ...base, source: "calendar" }), { body: { name: "Rendez-vous qui approche", instruction: "Range la facture.", filter: { keywords: ["facture"], leadMinutes: 30 }, maxPerHour: 6 } });
  assert.deepEqual(triggerPayload({ ...base, source: "webhook", name: " Mon CRM " }), { body: { name: "Mon CRM", instruction: "Range la facture.", filter: { keywords: ["facture"] }, maxPerHour: 6 } });
});

test("ce qui manque ou déborde est dit avant l'envoi", () => {
  const ok = { ...draftOf(null), instruction: "x" };
  assert.ok("error" in triggerPayload({ ...ok, instruction: "  " }));
  assert.ok("error" in triggerPayload({ ...ok, instruction: "x".repeat(4001) }));
  assert.ok("error" in triggerPayload({ ...ok, maxPerHour: 31 }));
  assert.ok("error" in triggerPayload({ ...ok, source: "calendar", leadMinutes: 2 }));
  assert.ok("error" in triggerPayload({ ...ok, keywords: "a" }));
});

test("🔒 seuls les champs connus passent au back-office", () => {
  assert.deepEqual(pickCreate({ expert: "djeneba", name: "n", source: "unipile", instruction: "i", filter: { keywords: ["devis", 3], evil: 1 }, accountId: "../x", memberId: 7 }), { expert: "djeneba", name: "n", source: "unipile", instruction: "i", filter: { keywords: ["devis"] } });
  assert.equal(pickCreate({ expert: "../root", name: "n", source: "gmail", instruction: "i" }), null);
  assert.equal(pickCreate({ expert: "djeneba", name: "n", source: "sms", instruction: "i" }), null);
  assert.deepEqual(pickPatch({ source: "gmail", expert: "x", enabled: false, rotateKey: "yes" }), { enabled: false });
  assert.deepEqual(pickPatch({ rotateKey: true }), { rotateKey: true });
  assert.equal(pickPatch({ source: "gmail" }), null);
});

test("refus : phrase à nous pour Composio, celle du back-office pour un champ ou un conflit", () => {
  assert.match(triggerRefusalMessage("composio_refused") ?? "", /Intégrations/);
  assert.equal(triggerRefusalMessage("bad_trigger"), null);
  assert.equal(triggerRefusalMessage("conflict"), null);
});

test("comptes écoutés : actifs de la bonne application, le défaut d'abord, titrés par l'e-mail", () => {
  const conns = [
    { id: "ca_a", status: "ACTIVE", toolkitSlug: "gmail", email: "a@x.ci", updatedAt: 3 },
    { id: "ca_b", status: "ACTIVE", toolkitSlug: "gmail", email: "b@x.ci", isDefault: true, updatedAt: 1 },
    { id: "ca_c", status: "FAILED", toolkitSlug: "gmail", email: "c@x.ci" },
    { id: "ca_d", status: "ACTIVE", toolkitSlug: "googlecalendar", alias: "Agenda pro" },
  ];
  assert.deepEqual(triggerAccounts(conns, "gmail"), [
    { id: "ca_b", title: "b@x.ci", isDefault: true },
    { id: "ca_a", title: "a@x.ci", isDefault: false },
  ]);
  assert.deepEqual(triggerAccounts(conns, "calendar"), [{ id: "ca_d", title: "Agenda pro", isDefault: false }]);
  assert.deepEqual(triggerAccounts(conns, "webhook"), []);
});

test("compte : implicite s'il est seul, obligatoire et connu s'ils sont plusieurs", () => {
  const one = [{ id: "ca_a", title: "a", isDefault: false }];
  const two = [...one, { id: "ca_b", title: "b", isDefault: true }];
  assert.deepEqual(accountChoice([], ""), {});
  assert.deepEqual(accountChoice(one, "ca_a"), {});
  assert.deepEqual(accountChoice(two, "ca_b"), { accountId: "ca_b" });
  assert.ok("error" in accountChoice(two, ""));
  assert.ok("error" in accountChoice(two, "ca_z"));
  assert.deepEqual(pickCreate({ expert: "djeneba", name: "n", source: "gmail", instruction: "i", accountId: "ca_b" }), { expert: "djeneba", name: "n", source: "gmail", instruction: "i", accountId: "ca_b" });
});

test("ligne : nom du compte écouté retrouvé dans les Connecteurs, rien s'il a disparu", () => {
  const conns = [{ id: "ca_a", status: "ACTIVE", toolkitSlug: "gmail", email: "a@x.ci" }, { id: "ca_b", status: "ACTIVE", toolkitSlug: "outlook" }];
  assert.equal(accountNameOf(conns, "ca_a"), "a@x.ci");
  assert.equal(accountNameOf(conns, "ca_b"), "Compte 1");
  assert.equal(accountNameOf(conns, "ca_z"), null);
  assert.equal(accountNameOf(conns, null), null);
});

test("clé : montrée une fois, jamais quand l'instance s'est abonnée chez Unipile", () => {
  const t = { ...draftOf(null), id: "t1", expert: "e", enabled: true, filter: { senders: [], domains: [], keywords: [], leadMinutes: null }, lastFiredAt: null, accountId: null, webhookUrl: "https://x", source: "unipile" as const };
  assert.equal(revealsKey({ ...t, webhookSubscribed: false, key: "ytk_1" }), true);
  assert.equal(revealsKey({ ...t, webhookSubscribed: true, key: "ytk_1" }), false);
  assert.equal(revealsKey({ ...t, webhookSubscribed: false }), false);
});
