import assert from "node:assert/strict";
import { test } from "node:test";
import { CLAUDE_CODE_RE, describeClaudeAuth, safeLoginUrl, secretKind, usageByExpert } from "./claude-code-auth.ts";

const auth = { loggedIn: true, method: "claude.ai", email: "a@b.ci", plan: "max" };

test("la clé passe devant l’abonnement ; l’abonnement nomme son forfait", () => {
  assert.equal(describeClaudeAuth({ auth, key: true, login: null }), "Clé Anthropic");
  assert.equal(describeClaudeAuth({ auth, key: false, login: null }), "Claude Max (a@b.ci)");
  assert.equal(describeClaudeAuth({ auth: { loggedIn: false, method: "none", email: null, plan: null }, key: false, login: null }), "Aucun modèle connecté");
});

test("seule une adresse d’Anthropic s’ouvre ; le code garde sa forme", () => {
  assert.equal(safeLoginUrl("https://claude.com/cai/oauth/authorize?x=1"), "https://claude.com/cai/oauth/authorize?x=1");
  assert.equal(safeLoginUrl("https://evil.example/"), null);
  assert.equal(safeLoginUrl("javascript:alert(1)"), null);
  assert.ok(CLAUDE_CODE_RE.test("Xy7Kq2Lm9Np4#state"));
  assert.ok(!CLAUDE_CODE_RE.test("a b"));
});

const cred = (id: string, kind: "api_key" | "oauth_token", exhaustedUntil: string | null = null, label: string | null = null) => ({ id, kind, label, last4: "x9Qa", addedAt: null, exhaustedUntil });
const out = { loggedIn: false, method: "none", email: null, plan: null };

test("le premier compte disponible est en service ; un compte à court passe la main", () => {
  const now = Date.parse("2026-10-24T10:00:00Z");
  const credentials = [cred("a1b2c3d4e5f6", "oauth_token", "2026-10-24T13:00:00Z", "Max de Koffi"), cred("a1b2c3d4e5f7", "api_key")];
  assert.equal(describeClaudeAuth({ auth: out, key: true, credentials, login: null }, now), "Clé Anthropic (…x9Qa)");
  assert.equal(describeClaudeAuth({ auth: out, key: false, credentials: [credentials[0]!], login: null }, now), "Tous les comptes sont à court");
  assert.equal(describeClaudeAuth({ auth, key: false, credentials: [credentials[0]!], login: null }, now), "Claude Max (a@b.ci)");
});

test("la forme du secret dit son type", () => {
  assert.equal(secretKind(`sk-ant-oat01-${"b".repeat(40)}`), "oauth_token");
  assert.equal(secretKind(`sk-ant-api03-${"a".repeat(40)}`), "api_key");
  assert.equal(secretKind("sk-ant-oat01-x y"), null);
});

test("la consommation se lit par expert, du plus gourmand au moins", () => {
  const row = (profile: string, costUsd: number) => ({ day: "2026-10-24", profile, model: "m", credential: null, kind: "subscription", turns: 2, inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd });
  assert.deepEqual(usageByExpert([row("koffi", 0.1), row("djeneba", 0.5), row("koffi", 0.2)]).map((l) => [l.profile, l.turns]), [["djeneba", 2], ["koffi", 4]]);
});
