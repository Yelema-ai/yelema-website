// The client's own tool servers (MCP), as the app sees them. The back office owns everything that
// matters: the rules on a name, an address and a token, the token's encryption, and the writing on
// the instances. This module only shapes what goes to it, and turns its refusal codes into the
// sentences a member reads. Contract: yelema-platform docs/specs/client-api-v1, `/app/mcp`.

import { scopePath, type SettingScope } from "./llm.ts";

/**
 * `oauth`: nothing typed here; each member then authorizes their own account from the MCP screen.
 * `stdio`: an entry of Yelema's catalogue, a program run on the instance; no address, never a command.
 */
export type McpAuth = "none" | "bearer" | "oauth" | "stdio";
/** Where the writing of a server on the instances stands. Not whether the server itself answers: the back office never calls it. */
export type McpState = "applied" | "pending" | "failed";

/** A server in place. Never its token: `hint` is its last four characters, null without one. */
export interface McpServer {
  /** What the removal routes take. */
  id: string;
  name: string;
  url: string;
  auth: McpAuth;
  /** The catalogue key of a `stdio` server. */
  stdio: string | null;
  hint: string | null;
  /** The header that carries the token as is (`X-API-KEY`); null: `Authorization: Bearer`. */
  header: string | null;
  state: McpState;
  updatedAt: string | null;
}

export interface McpMember {
  /** What the per-member routes take. */
  id: string;
  name: string | null;
  email: string;
  servers: McpServer[];
}

/** A server Yelema offers to run on the instance (its package and command stay in the back office). */
export interface McpStdioOption {
  key: string;
  label: string;
  description: string;
  docs: string;
}

export interface McpOverview {
  /** The signed-in user's own servers. */
  own: McpServer[];
  stdioCatalogue: McpStdioOption[];
  /** Admins only. */
  client?: McpServer[];
  members?: McpMember[];
}

export interface McpWritten {
  ok: true;
  state: "pending" | "applied";
  /** The server just added; absent from a removal. */
  server?: McpServer;
}

export interface McpServerDraft {
  name: string;
  url: string;
  auth: McpAuth;
  /** With `bearer` only. */
  token?: string;
  /** With `bearer` only: the header that carries the token as is, instead of `Authorization: Bearer`. */
  header?: string;
  /** With `stdio` only: a key of `stdioCatalogue`. */
  stdio?: string;
}

// Loose bounds only: the back office holds the real rules (the shape of a name, a public https
// address, the characters of a token). These keep an oversized or mistyped body from travelling.

const HEADER = /^[A-Za-z][A-Za-z0-9-]{0,62}[A-Za-z0-9]$/;

/** A server draft from a request body, with nothing but its fields; null when it is not one. */
export function parseServerDraft(body: unknown): McpServerDraft | null {
  if (!body || typeof body !== "object") return null;
  const { name, url, auth, token, stdio, header } = body as Record<string, unknown>;
  const named = typeof header === "string" ? header.trim() : header;
  if (named !== undefined && named !== "" && (auth !== "bearer" || typeof named !== "string" || !HEADER.test(named))) return null;
  if (typeof name !== "string" || !name.trim() || name.length > 60) return null;
  if (auth === "stdio") return typeof stdio === "string" && /^[a-z0-9_-]{1,40}$/.test(stdio) && url === undefined && token === undefined ? { name: name.trim(), url: "", auth, stdio } : null;
  if (typeof url !== "string" || !url.trim() || url.length > 2000) return null;
  if (auth !== "none" && auth !== "bearer" && auth !== "oauth") return null;
  const draft: McpServerDraft = { name: name.trim(), url: url.trim(), auth };
  if (auth !== "bearer") return token === undefined || token === "" ? draft : null;
  if (typeof token !== "string" || !token.trim() || token.length > 4200) return null;
  return { ...draft, token: token.trim(), ...(named ? { header: named as string } : {}) };
}

const SERVER_ID = /^\d{1,12}$/;
export const isServerId = (id: unknown): id is string => typeof id === "string" && SERVER_ID.test(id);

/** The back office's path to add a server to a scope; null for a member id that is not one. */
export const mcpScopePath = (scope: SettingScope): string | null => scopePath("/app/mcp", scope);

/** The back office's path of one server of a scope; null when either id is not a plain number. */
export function mcpServerPath(scope: SettingScope, serverId: unknown): string | null {
  const base = mcpScopePath(scope);
  return base && isServerId(serverId) ? `${base}/${serverId}` : null;
}

const REFUSALS: Record<string, string> = {
  bad_name: "Ce nom n’est pas valide : une lettre minuscule, puis des minuscules, des chiffres ou « _ », 40 caractères au plus, sans espace ni tiret.",
  reserved_name: "Ce nom est réservé. Choisissez-en un autre.",
  duplicate_name: "Un serveur porte déjà ce nom. Choisissez-en un autre, ou supprimez d’abord l’ancien.",
  bad_url: "Cette adresse n’est pas acceptée : elle doit commencer par https:// et être joignable depuis Internet.",
  bad_token: "Ce jeton n’est pas valide. Vérifiez qu’il est copié en entier, sans espace ni retour à la ligne.",
  too_many_servers: "Vous avez atteint le nombre maximal de serveurs (10). Supprimez-en un pour en ajouter un autre.",
  bad_request: "Cette demande n’a pas pu être traitée.",
  forbidden: "Ce réglage est réservé aux administrateurs de votre espace.",
  not_found: "Ce serveur est introuvable.",
  too_many_attempts: "Trop d’essais en peu de temps. Réessayez dans une heure.",
  stale_flow: "Cette fenêtre appartient à une autorisation remplacée depuis : terminez-la dans la dernière fenêtre ouverte.",
  unavailable: "L’enregistrement est momentanément indisponible. Réessayez plus tard.",
  conflict: "Votre instance n’est pas prête pour cette autorisation. Réessayez dans un instant.",
  bad_callback: "Le retour du fournisseur est incomplet. Relancez l’autorisation.",
  oauth_unavailable: "Ce serveur n’a pas proposé d’autorisation. Vérifiez son adresse, ou choisissez une autre méthode.",
  instance_error: "Votre instance n’a pas pu traiter la demande. Réessayez dans un instant.",
  bad_stdio: "Ce serveur ne fait pas partie du catalogue de Yelema.",
  bad_header: "Cet en-tête n’est pas accepté : des lettres, des chiffres et des tirets (X-API-KEY…), ni Authorization ni un en-tête du navigateur.",
};

/**
 * The sentence for one of the back office's refusal codes, or null for a code that is not one of
 * these (the caller then answers its usual sentence). The back office's own text is never shown.
 */
export function mcpRefusalMessage(code: string): string | null {
  return Object.hasOwn(REFUSALS, code) ? REFUSALS[code] : null;
}

/** An OAuth server as the caller's own instance holds it: authorized (tokens there) or not yet. */
export interface McpOauthServer {
  id: string;
  name: string;
  connected: boolean;
  pending: boolean;
}

/** What the provider sent back to the browser, as the return page relays it. */
export interface McpOauthQuery {
  code?: string;
  state: string;
  iss?: string;
  error?: string;
}

const QUERY_VALUE = /^[\x21-\x7e]{1,4096}$/;

/** The four parameters of a provider's return, printable and bounded; null when `state` or both `code` and `error` are missing. */
export function parseOauthQuery(body: unknown): McpOauthQuery | null {
  if (!body || typeof body !== "object") return null;
  const raw = body as Record<string, unknown>;
  const pick = (k: string): string | undefined => (typeof raw[k] === "string" && QUERY_VALUE.test(raw[k] as string) ? (raw[k] as string) : undefined);
  const q: McpOauthQuery = { state: pick("state") ?? "", code: pick("code"), iss: pick("iss"), error: pick("error") };
  if (!q.state || (!q.code && !q.error)) return null;
  return Object.fromEntries(Object.entries(q).filter(([, v]) => v !== undefined)) as unknown as McpOauthQuery;
}

export const MCP_STATE_LABELS: Record<McpState, string> = {
  applied: "En service",
  pending: "Installation en cours",
  failed: "Installation en échec",
};

/** True while the back office is still writing a server somewhere the caller can see. */
export function mcpPending(o: McpOverview): boolean {
  return [...o.own, ...(o.client ?? []), ...(o.members ?? []).flatMap((m) => m.servers)].some((s) => s.state === "pending");
}

export type McpToolState = "ok" | "to_authorize" | "failed";
/** What each server of the caller's instance exposes, as last surveyed there. Descriptions come from the servers: plain text only. */
export interface McpToolsReport {
  at: string;
  servers: { name: string; managed: boolean; state: McpToolState; tools: { name: string; description: string }[] }[];
}
export interface McpToolsOverview {
  own: McpToolsReport | null;
  members?: { id: string; name: string | null; email: string; report: McpToolsReport | null }[];
}
