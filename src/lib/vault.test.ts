import assert from "node:assert/strict";
import { test } from "node:test";
import { parseVaultDraft, parseVaultProfiles, parseVaultRefs, profileLabel, vaultPath, vaultRefusalMessage } from "./vault.ts";

test("the back office path of a vault scope, profile and handle; null for anything malformed", () => {
  assert.equal(vaultPath({ kind: "own" }, "adjoua"), "/app/vault/own/adjoua");
  assert.equal(vaultPath({ kind: "member", id: "42" }, "default", "vault_0123456789ab"), "/app/vault/members/42/default/vault_0123456789ab");
  assert.equal(vaultPath({ kind: "own" }, "../x"), null);
  assert.equal(vaultPath({ kind: "member", id: "4a" }, "adjoua"), null);
  assert.equal(vaultPath({ kind: "own" }, "adjoua", "a/b"), null);
});

test("a draft keeps its six fields only; the password is never trimmed", () => {
  const d = parseVaultDraft({ label: " CNPS ", origin: "https://e.cnps.ci", identifierType: "email", identifier: " rh@acme.ci ", password: " p ", purpose: " Déclarer ", extra: 1 });
  assert.deepEqual(d, { label: "CNPS", origin: "https://e.cnps.ci", identifierType: "email", identifier: "rh@acme.ci", password: " p ", purpose: "Déclarer" });
  assert.equal(parseVaultDraft({ label: "x", origin: "https://a.b", identifierType: "login", identifier: "u", password: "p" }), null);
  assert.equal(parseVaultDraft({ label: "x", origin: "https://a.b", identifierType: "email", identifier: "u", password: "" }), null);
});

test("names and refusal sentences", () => {
  assert.equal(profileLabel("default"), "Accès commun");
  assert.equal(profileLabel("acme__koffi"), "Koffi");
  assert.equal(profileLabel("adjoua"), "Adjoua");
  assert.match(vaultRefusalMessage("bad_origin") ?? "", /https/);
  assert.equal(vaultRefusalMessage("toString"), null);
});

test("entries of one expert or of all, newest first", async () => {
  const { entriesOf } = await import("./vault.ts");
  const e = (id: string, profile: string, createdAt: string) => ({ id, profile, createdAt, label: id, origin: "https://a.b", identifierType: "email" as const, identifier: "x", purpose: "" });
  const items = [e("a", "adjoua", "2026-10-01"), e("b", "default", "2026-10-03"), e("c", "adjoua", "2026-10-02")];
  assert.deepEqual(entriesOf(items, null).map((i) => i.id), ["b", "c", "a"]);
  assert.deepEqual(entriesOf(items, "adjoua").map((i) => i.id), ["c", "a"]);
});

test("the profiles of a grouped add and the handles of a grouped removal; null for anything malformed", () => {
  assert.deepEqual(parseVaultProfiles(["default", "adjoua"]), ["default", "adjoua"]);
  assert.equal(parseVaultProfiles([]), null);
  assert.equal(parseVaultProfiles(["../x"]), null);
  assert.equal(parseVaultProfiles("adjoua"), null);
  assert.deepEqual(parseVaultRefs([{ profile: "adjoua", handle: "vault_0123456789ab", extra: 1 }]), [{ profile: "adjoua", handle: "vault_0123456789ab" }]);
  assert.equal(parseVaultRefs([{ profile: "adjoua", handle: "a/b" }]), null);
  assert.equal(parseVaultRefs([]), null);
});
