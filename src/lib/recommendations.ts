import { isChannelConnected, type MessagingPlatform } from "./channels.ts";
import { isConnectionActive } from "./expert-tools.ts";
import { catalogToolkit, composioLogoUrl } from "./integration-catalog.ts";
import type { McpOauthServer, McpToolsReport } from "./mcp-servers.ts";
import type { IntegrationConnection } from "./types.ts";

// L'aperçu des intégrations d'un membre : ce qui est branché sur ses experts, et ce qu'il lui reste
// à faire pour qu'ils en aient plus. Calculé ici, sur ce que l'app lit déjà (relevé MCP du back-office,
// canaux et connecteurs de l'instance) ; rien n'est appelé de plus.

export type Recommendation = { key: string; title: string; detail: string; href: string };
export type IntegrationsSummary = { tools: number; servers: number; connectors: string[]; channels: string[]; todo: Recommendation[] };

/** Les canaux qu'on propose d'abord quand aucun n'est branché. */
const SUGGESTED_CHANNELS = ["telegram", "whatsapp", "teams", "slack"];

export function summarize(input: { report: McpToolsReport | null; oauth: McpOauthServer[]; channels: MessagingPlatform[]; connections: IntegrationConnection[] }): IntegrationsSummary {
  const ok = (input.report?.servers ?? []).filter((s) => s.state === "ok");
  const todo: Recommendation[] = [];
  for (const s of input.oauth.filter((o) => !o.connected)) todo.push({ key: `oauth:${s.name}`, title: `Autoriser ${s.name}`, detail: "Ce serveur attend que vous vous connectiez chez son fournisseur : ses outils ne servent pas encore.", href: "/integrations/mcp" });
  for (const s of (input.report?.servers ?? []).filter((x) => x.state === "failed" && !x.managed)) todo.push({ key: `failed:${s.name}`, title: `Vérifier ${s.name}`, detail: "Ce serveur ne répondait pas au dernier relevé.", href: "/integrations/mcp" });
  const channels = input.channels.filter(isChannelConnected).map((c) => c.name);
  if (channels.length === 0) {
    const names = input.channels.filter((c) => SUGGESTED_CHANNELS.includes(c.id)).map((c) => c.name);
    if (names.length) todo.push({ key: "channels", title: "Brancher un canal", detail: `Écrivez à vos Experts depuis ${names.join(", ")}.`, href: "/integrations/canaux" });
  }
  const connectors = [...new Set(input.connections.filter(isConnectionActive).map((c) => c.toolkitName || c.toolkitSlug || "").filter(Boolean))];
  if (connectors.length === 0) todo.push({ key: "connectors", title: "Connecter vos outils", detail: "Gmail, Drive, Notion… : vos Experts travaillent dans vos applications.", href: "/integrations/connecteurs" });
  return { tools: ok.reduce((n, s) => n + s.tools.length, 0), servers: ok.length, connectors, channels, todo };
}

// ---- Ce que les cartes de l'aperçu montrent : chaque intégration et son état ----

/** Où en est une intégration : en service, en attente d'une connexion chez le fournisseur, ou en panne. */
export type OverviewState = "active" | "to_authorize" | "to_check";
export type OverviewItem = { key: string; name: string; state: OverviewState; logo: string | null; channel: string | null; tools: number | null; href: string };
export type OverviewSections = { connectors: OverviewItem[]; channels: OverviewItem[]; servers: OverviewItem[] };

const RANK: Record<OverviewState, number> = { to_authorize: 0, to_check: 1, active: 2 };
// Ce qui attend un geste d'abord, puis ce qui marche, chacun par nom.
const byState = (a: OverviewItem, b: OverviewItem) => RANK[a.state] - RANK[b.state] || a.name.localeCompare(b.name, "fr");

function connectionState(c: IntegrationConnection): OverviewState | null {
  if (c.isDisabled) return null;
  if (isConnectionActive(c)) return "active";
  const s = (c.status || "").toUpperCase();
  if (s === "INITIATED" || s === "INITIALIZING") return "to_authorize";
  if (s === "FAILED" || s === "EXPIRED") return "to_check";
  return null;
}

/** Ce qui est branché, ligne par ligne : connecteurs (un par application), canaux mis en route,
 *  serveurs MCP du client (ceux de Yelema ne se règlent pas ici). Un canal allumé qui n'est pas
 *  connecté est à vérifier. */
export function overview(input: { report: McpToolsReport | null; oauth: McpOauthServer[]; channels: MessagingPlatform[]; connections: IntegrationConnection[] }): OverviewSections {
  const connectors = new Map<string, OverviewItem>();
  for (const c of input.connections) {
    const slug = (c.toolkitSlug || "").toLowerCase();
    const state = connectionState(c);
    if (!slug || !state) continue;
    const had = connectors.get(slug);
    if (had && RANK[had.state] >= RANK[state]) continue;
    const name = catalogToolkit(slug)?.name ?? c.toolkitName ?? slug;
    connectors.set(slug, { key: `connector:${slug}`, name, state, logo: composioLogoUrl(slug), channel: null, tools: null, href: "/integrations/connecteurs" });
  }
  const channels: OverviewItem[] = input.channels
    .filter((c) => c.enabled)
    .map((c) => ({ key: `channel:${c.id}`, name: c.name, state: isChannelConnected(c) ? "active" : "to_check", logo: null, channel: c.id, tools: null, href: "/integrations/canaux" }));
  const servers = new Map<string, OverviewItem>();
  for (const s of input.report?.servers ?? []) {
    if (s.managed) continue;
    const state: OverviewState = s.state === "ok" ? "active" : s.state === "to_authorize" ? "to_authorize" : "to_check";
    servers.set(s.name, { key: `server:${s.name}`, name: s.name, state, logo: null, channel: null, tools: s.state === "ok" ? s.tools.length : null, href: "/integrations/mcp" });
  }
  for (const o of input.oauth) {
    if (!o.connected && !servers.has(o.name)) servers.set(o.name, { key: `server:${o.name}`, name: o.name, state: "to_authorize", logo: null, channel: null, tools: null, href: "/integrations/mcp" });
  }
  return { connectors: [...connectors.values()].sort(byState), channels: channels.sort(byState), servers: [...servers.values()].sort(byState) };
}
