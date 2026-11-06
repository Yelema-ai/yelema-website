// Le modèle d'une instance Claude Code : l'abonnement Claude du membre, et des comptes en liste ordonnée
// (clés API, jetons d'abonnement), tous gardés sur l'instance. Types du contrat `/app/claude-code/auth`.

export type ClaudeAuth = { loggedIn: boolean; method: string; email: string | null; plan: string | null };
export type ClaudeLogin = { state: "waiting_code" | "checking" | "done" | "failed" | "expired" | "cancelled"; url?: string; expiresAt?: string | null; reason?: string };
export type ClaudeCredential = { id: string; kind: "api_key" | "oauth_token"; label: string | null; last4: string; addedAt: string | null; exhaustedUntil: string | null };
export type ClaudeAuthStatus = { auth: ClaudeAuth; key: boolean; credentials?: ClaudeCredential[]; login: ClaudeLogin | null };
export type ClaudeUsageRow = { day: string; profile: string | null; model: string | null; credential: string | null; kind: string | null; turns: number; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; costUsd: number };
export type ClaudeUsage = { from: string; to: string; rows: ClaudeUsageRow[] };
/** Réponse de la route de l'app pour une instance qui n'est pas sous Claude Code. */
export type ClaudeAuthView = ClaudeAuthStatus | { unsupported: true };

export const CLAUDE_CODE_RE = /^[A-Za-z0-9_#.-]{10,512}$/;
export const CREDENTIAL_ID_RE = /^[0-9a-f]{12}$/;
const SECRET_RE = { api_key: /^sk-ant-api\d{2}-[A-Za-z0-9_-]{20,300}$/, oauth_token: /^sk-ant-oat\d{2}-[A-Za-z0-9_-]{20,300}$/ } as const;
/** `api_key` (Console), `oauth_token` (`claude setup-token`), ou `null` pour toute autre forme. */
export const secretKind = (v: string): ClaudeCredential["kind"] | null => (SECRET_RE.api_key.test(v) ? "api_key" : SECRET_RE.oauth_token.test(v) ? "oauth_token" : null);
export const KIND_LABELS: Record<string, string> = { api_key: "Clé Anthropic", oauth_token: "Clé d’abonnement", subscription: "Abonnement connecté" };
const LOGIN_HOSTS = new Set(["claude.com", "claude.ai", "platform.claude.com", "console.anthropic.com"]);

/** L'adresse de connexion, seulement si elle mène chez Anthropic. */
export function safeLoginUrl(v: unknown): string | null {
  try {
    const u = new URL(String(v));
    return u.protocol === "https:" && LOGIN_HOSTS.has(u.hostname) ? u.toString() : null;
  } catch {
    return null;
  }
}

const PLANS: Record<string, string> = { pro: "Claude Pro", max: "Claude Max", team: "Claude Team", enterprise: "Claude Enterprise" };

/** Ce qui sert l'instance, en une phrase : le premier compte disponible, sinon l'abonnement connecté. */
export function describeClaudeAuth(s: ClaudeAuthStatus, now = Date.now()): string {
  const live = (s.credentials ?? []).find((c) => !c.exhaustedUntil || Date.parse(c.exhaustedUntil) <= now);
  if (live) return `${live.label ?? KIND_LABELS[live.kind]} (…${live.last4})`;
  if (s.key) return "Clé Anthropic";
  if (s.auth.loggedIn && s.auth.method === "claude.ai") return `${(s.auth.plan && PLANS[s.auth.plan]) || "Abonnement Claude"}${s.auth.email ? ` (${s.auth.email})` : ""}`;
  if (s.auth.loggedIn) return "Compte Anthropic connecté";
  if (s.credentials?.length) return "Tous les comptes sont à court";
  return "Aucun modèle connecté";
}

/** Totaux du relevé par expert, du plus gourmand au moins. */
export function usageByExpert(rows: ClaudeUsageRow[]): { profile: string; turns: number; tokens: number; costUsd: number }[] {
  const out = new Map<string, { profile: string; turns: number; tokens: number; costUsd: number }>();
  for (const r of rows) {
    const k = r.profile ?? "";
    const t = out.get(k) ?? { profile: k, turns: 0, tokens: 0, costUsd: 0 };
    t.turns += r.turns;
    t.tokens += r.inputTokens + r.outputTokens;
    t.costUsd += r.costUsd;
    out.set(k, t);
  }
  return [...out.values()].sort((a, b) => b.costUsd - a.costUsd || b.tokens - a.tokens);
}

const REFUSALS: Record<string, string> = {
  not_claude_code: "Cet espace n’utilise pas Claude.",
  image_outdated: "Cet espace doit d’abord être mis à jour par l’équipe Yelema.",
  login_unavailable: "La connexion n’a pas pu démarrer. Réessayez dans un instant.",
  instance_error: "La demande n’a pas abouti. Réessayez dans un instant.",
  bad_secret_format: "Cette clé n’a pas la forme d’une clé Anthropic (sk-ant-api…).",
  secret_refused: "Anthropic refuse cette clé.",
  bad_key: "Collez une clé Anthropic (sk-ant-api…) ou une clé d’abonnement (sk-ant-oat…).",
  conflict: "Dix comptes au plus par espace : retirez-en un d’abord.",
};
export const claudeAuthRefusal = (code: string): string | null => (Object.hasOwn(REFUSALS, code) ? REFUSALS[code]! : null);

export const LOGIN_FAILURES: Record<string, string> = {
  bad_code: "Ce code n’a pas la bonne forme : copiez-le en entier depuis la page de Claude.",
  code_refused: "Claude a refusé ce code (expiré ou déjà utilisé). Relancez la connexion.",
  no_login: "La connexion a expiré. Relancez-la.",
  login_failed: "La connexion n’a pas abouti. Relancez-la.",
};
