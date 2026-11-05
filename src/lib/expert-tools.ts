// The tools an expert needs (`outils-recommandes.json`, shipped in its pack) and where each stands
// for this member. Shared by the BFF and the Outils tab: type-only imports.
import type { IntegrationConnection } from "./types.ts";

export type ToolType = "application" | "mcp" | "source-publique" | "socle";
export type ToolPriority = "essentiel" | "utile";

export interface ExpertTool {
  nom: string;
  usage: string;
  type: ToolType;
  /** Composio toolkit slug, when the pack knows it. */
  composio: string | null;
  priorite: ToolPriority;
}

/** Larger files are refused before parsing. */
export const TOOLS_FILE_MAX_BYTES = 64 * 1024;
const MAX_TOOLS = 50;
const TYPES: readonly string[] = ["application", "mcp", "source-publique", "socle"];
const SLUG = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

const text = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.trim() && v.length <= max ? v.trim() : null;

function parseTool(raw: unknown): ExpertTool | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const t = raw as Record<string, unknown>;
  const nom = text(t.nom, 80);
  const usage = t.usage === undefined || t.usage === "" ? "" : text(t.usage, 240);
  if (!nom || usage === null || typeof t.type !== "string" || !TYPES.includes(t.type)) return null;
  if (t.priorite !== "essentiel" && t.priorite !== "utile") return null;
  const composio = t.composio ?? null;
  if (composio !== null && !(typeof composio === "string" && SLUG.test(composio))) return null;
  return { nom, usage, type: t.type as ToolType, composio: typeof composio === "string" ? composio.toLowerCase() : null, priorite: t.priorite };
}

/** The tools of a file's text; null when the file is not a version-1 list (a bad entry alone is dropped). */
export function parseToolsFile(body: string): ExpertTool[] | null {
  if (body.length > TOOLS_FILE_MAX_BYTES) return null;
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const { version, outils } = data as Record<string, unknown>;
  if (version !== 1 || !Array.isArray(outils)) return null;
  const seen = new Set<string>();
  return outils.slice(0, MAX_TOOLS).flatMap((raw) => {
    const tool = parseTool(raw);
    if (!tool || seen.has(key(tool.nom))) return [];
    seen.add(key(tool.nom));
    return [tool];
  });
}

/**
 * The gateway's grouped read (`experts/files/<name>?profiles=`): `{ data: { <profile>: entry } }`, an entry
 * being the file's text (or `{ content }`, or the file already parsed), null when there is none, or
 * `{ error: { status } }`. A 404 or an unreadable file is an empty list, as on the single route; another
 * error leaves its profile out, for the caller to read it alone.
 */
export function parseGroupedToolsFiles(body: unknown, asked: readonly string[]): Map<string, ExpertTool[]> {
  const out = new Map<string, ExpertTool[]>();
  const data = body && typeof body === "object" ? (body as { data?: unknown }).data : null;
  if (!data || typeof data !== "object" || Array.isArray(data)) return out;
  for (const profile of asked) {
    if (!Object.hasOwn(data, profile)) continue;
    const v = (data as Record<string, unknown>)[profile];
    if (v === null) out.set(profile, []);
    else if (typeof v === "string") out.set(profile, parseToolsFile(v) ?? []);
    else if (v && typeof v === "object" && !Array.isArray(v)) {
      const e = v as { error?: { status?: unknown }; content?: unknown };
      if (e.error) {
        if (e.error.status === 404) out.set(profile, []);
      } else if (typeof e.content === "string") out.set(profile, parseToolsFile(e.content) ?? []);
      else out.set(profile, parseToolsFile(JSON.stringify(v)) ?? []);
    }
  }
  return out;
}

/** Letters and digits only, lower case, no accents: "Google Drive" = "google_drive". */
export const key = (s: string): string =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

export function isConnectionActive(c: IntegrationConnection): boolean {
  return (c.status || "").toUpperCase() === "ACTIVE" && !c.isDisabled;
}

/** `ready`: connected or plugged in; `todo`: the member or the company has a step to take; `included`: nothing to do. */
export type ToolStatus = "ready" | "todo" | "included";

export interface ToolState extends ExpertTool {
  status: ToolStatus;
}

export function toolStatus(tool: ExpertTool, connections: IntegrationConnection[], mcpNames: string[]): ToolStatus {
  const name = key(tool.nom);
  const same = (v: string | null | undefined, k: string | null) => Boolean(v && k && key(v) === k);
  switch (tool.type) {
    case "socle":
    case "source-publique":
      return "included";
    case "application": {
      const slug = tool.composio && key(tool.composio);
      const hit = connections.some(
        (c) => isConnectionActive(c) && [c.toolkitSlug, c.toolkitName].some((v) => same(v, slug) || same(v, name))
      );
      return hit ? "ready" : "todo";
    }
    case "mcp":
      return mcpNames.some((n) => same(n, name)) ? "ready" : "todo";
  }
}

export interface ToolsOverview {
  todo: ToolState[];
  ready: ToolState[];
  included: ToolState[];
  /** Ready or included. */
  usable: number;
  total: number;
}

/** The tools grouped for the tab; what is left to connect lists the essential ones first. */
export function toolsOverview(tools: ExpertTool[], connections: IntegrationConnection[], mcpNames: string[]): ToolsOverview {
  const states = tools.map((t) => ({ ...t, status: toolStatus(t, connections, mcpNames) }));
  const of = (s: ToolStatus) => states.filter((t) => t.status === s);
  const todo = of("todo").sort((a, b) => Number(b.priorite === "essentiel") - Number(a.priorite === "essentiel"));
  return { todo, ready: of("ready"), included: of("included"), usable: states.length - todo.length, total: states.length };
}
