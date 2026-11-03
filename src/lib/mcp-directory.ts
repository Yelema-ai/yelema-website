// The tool servers (MCP) a member can plug without knowing their address: each one checked by hand
// against the vendor's own documentation (27/10/26, source per vendor in
// projets/yelema/chat-entreprise-2310/maquette-mcp/annuaire_mcp_verifie.json on Yelema's side).
// Only servers the vendor hosts, that act on the member's own account, and that a member can
// authorize alone: no admin console, no pre-registered client. Any other server is still typed in
// by hand (« Saisir son adresse »). No imports, for `node --test`.

/**
 * `oauth`: the member signs in on the vendor's page. `bearer`: a key sent as `Authorization: Bearer`.
 * `header`: a key the vendor wants as is in a header of its own (`header`), sent as a `bearer` server with that header.
 */
export interface McpDirectoryEntry {
  key: string;
  name: string;
  /** For the logo. */
  domain: string;
  category: string;
  url: string;
  auth: "oauth" | "bearer" | "header";
  header?: string;
}

export const MCP_DIRECTORY: McpDirectoryEntry[] = [
  { key: "unipile", name: "Unipile", domain: "unipile.com", category: "Messagerie", url: "https://developer.unipile.com/mcp?branch=v2.0", auth: "header", header: "X-API-KEY" },
  { key: "notion", name: "Notion", domain: "notion.com", category: "Docs", url: "https://mcp.notion.com/mcp", auth: "oauth" },
  { key: "linear", name: "Linear", domain: "linear.app", category: "Projets", url: "https://mcp.linear.app/mcp", auth: "oauth" },
  { key: "stripe", name: "Stripe", domain: "stripe.com", category: "Paiements", url: "https://mcp.stripe.com", auth: "oauth" },
  { key: "github", name: "GitHub", domain: "github.com", category: "Code", url: "https://api.githubcopilot.com/mcp/", auth: "oauth" },
  { key: "atlassian", name: "Jira et Confluence", domain: "atlassian.com", category: "Projets", url: "https://mcp.atlassian.com/v2/mcp", auth: "oauth" },
  { key: "intercom", name: "Intercom", domain: "intercom.com", category: "Support client", url: "https://mcp.intercom.com/mcp", auth: "oauth" },
  { key: "make", name: "Make", domain: "make.com", category: "Automatisation", url: "https://mcp.make.com/v2", auth: "oauth" },
  { key: "paypal", name: "PayPal", domain: "paypal.com", category: "Paiements", url: "https://mcp.paypal.com/http", auth: "oauth" },
  { key: "square", name: "Square", domain: "squareup.com", category: "Paiements", url: "https://mcp.squareup.com/mcp", auth: "oauth" },
  { key: "webflow", name: "Webflow", domain: "webflow.com", category: "Site web", url: "https://mcp.webflow.com/mcp", auth: "oauth" },
  { key: "airtable", name: "Airtable", domain: "airtable.com", category: "Bases de données", url: "https://mcp.airtable.com/mcp", auth: "oauth" },
  { key: "monday", name: "monday.com", domain: "monday.com", category: "Projets", url: "https://mcp.monday.com/mcp", auth: "oauth" },
  { key: "apify", name: "Apify", domain: "apify.com", category: "Collecte web", url: "https://mcp.apify.com", auth: "oauth" },
  { key: "exa", name: "Exa", domain: "exa.ai", category: "Recherche web", url: "https://mcp.exa.ai/mcp", auth: "header", header: "x-api-key" },
  { key: "tavily", name: "Tavily", domain: "tavily.com", category: "Recherche web", url: "https://mcp.tavily.com/mcp/", auth: "oauth" },
  { key: "firecrawl", name: "Firecrawl", domain: "firecrawl.dev", category: "Collecte web", url: "https://mcp.firecrawl.dev/v2/mcp-oauth", auth: "oauth" },
  { key: "calendly", name: "Calendly", domain: "calendly.com", category: "Agenda", url: "https://mcp.calendly.com", auth: "oauth" },
  { key: "wix", name: "Wix", domain: "wix.com", category: "Site web", url: "https://mcp.wix.com/mcp", auth: "oauth" },
  { key: "pipedrive", name: "Pipedrive", domain: "pipedrive.com", category: "CRM", url: "https://mcp.pipedrive.ai/mcp", auth: "oauth" },
  { key: "close", name: "Close", domain: "close.com", category: "CRM", url: "https://mcp.close.com/mcp", auth: "oauth" },
  { key: "attio", name: "Attio", domain: "attio.com", category: "CRM", url: "https://mcp.attio.com/mcp", auth: "oauth" },
  { key: "apollo", name: "Apollo", domain: "apollo.io", category: "Prospection", url: "https://mcp.apollo.io/mcp", auth: "oauth" },
  { key: "fireflies", name: "Fireflies", domain: "fireflies.ai", category: "Réunions", url: "https://api.fireflies.ai/mcp", auth: "oauth" },
  { key: "granola", name: "Granola", domain: "granola.ai", category: "Réunions", url: "https://mcp.granola.ai/mcp", auth: "oauth" },
  { key: "brevo", name: "Brevo", domain: "brevo.com", category: "Marketing", url: "https://mcp.brevo.com/v1/brevo/mcp", auth: "bearer" },
  { key: "qonto", name: "Qonto", domain: "qonto.com", category: "Banque", url: "https://mcp.qonto.com/mcp", auth: "oauth" },
  { key: "miro", name: "Miro", domain: "miro.com", category: "Tableaux blancs", url: "https://mcp.miro.com", auth: "oauth" },
  { key: "klaviyo", name: "Klaviyo", domain: "klaviyo.com", category: "Marketing", url: "https://mcp.klaviyo.com/mcp", auth: "oauth" },
];

/** Shown before anything is typed: tools our clients ask for, that connect in one sign-in. */
export const MCP_FEATURED = ["notion", "airtable", "calendly", "brevo", "stripe", "pipedrive"];

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/** Whether a typed name and a tool's name are the same tool, accents, case and spaces aside. */
export function sameTool(typed: string, name: string): boolean {
  const a = fold(typed);
  return a.length > 0 && a === fold(name);
}

/** The entries for what the member typed: names that start with it first, then names that hold it. */
export function searchDirectory(query: string, list: McpDirectoryEntry[] = MCP_DIRECTORY): McpDirectoryEntry[] {
  const q = fold(query);
  if (!q) return MCP_FEATURED.map((k) => list.find((e) => e.key === k)).filter((e): e is McpDirectoryEntry => Boolean(e));
  const starts = list.filter((e) => fold(e.name).startsWith(q) || e.key.startsWith(q));
  const holds = list.filter((e) => !starts.includes(e) && (fold(e.name).includes(q) || fold(e.category).includes(q)));
  return [...starts, ...holds].slice(0, 6);
}

/** The server's name on the instance: lowercase, digits and « _ », as the back office asks. */
export function serverName(entry: McpDirectoryEntry): string {
  return entry.key.replace(/[^a-z0-9]+/g, "_");
}

/** A server name made from what the member typed (« Magnific AI » → « magnific_ai »). */
export function serverSlug(typed: string): string {
  return typed.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
}
