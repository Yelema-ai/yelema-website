// The tool executions inside one MCP request to Composio, as the proxy declares them to the back
// office (src/app/api/composio-mcp/route.ts). Composio counts each tool execution once: a
// COMPOSIO_MULTI_EXECUTE_TOOL of N tools is N executions, and its discovery tools are free. Only
// tool names leave here, never an argument nor an answer.
// Pure and without imports, so `node --test` runs it as it is.
// Adapted from extractBillableCalls in agent37-platform/hermes-openclaw-composio.

export type ComposioCallVia = "direct" | "multi_execute" | "meta";

export interface ComposioCall {
  tool: string;
  via: ComposioCallVia;
}

// The back office's own bounds: it refuses a whole declaration over one name or one call too many.
const TOOL_NAME = /^[A-Za-z0-9_.-]{1,128}$/;
export const MAX_CALLS = 200;
const MULTI_EXECUTE = "COMPOSIO_MULTI_EXECUTE_TOOL";
const MULTI_EXECUTE_CAP = 50;
// Declared all the same, marked `meta`: the back office prices them at zero.
const DISCOVERY_TOOLS = new Set(["COMPOSIO_SEARCH_TOOLS", "COMPOSIO_GET_TOOL_SCHEMAS"]);

function validName(value: unknown): value is string {
  return typeof value === "string" && TOOL_NAME.test(value);
}

// The body comes from the instance, so nothing in it is trusted: a body that does not parse gives
// no call, a tool name out of bounds is dropped, and the list never exceeds MAX_CALLS.
export function extractComposioCalls(bodyText: string): ComposioCall[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return [];
  }

  const out: ComposioCall[] = [];
  for (const message of Array.isArray(parsed) ? parsed : [parsed]) {
    if (out.length >= MAX_CALLS) break;
    const m = message as { method?: unknown; params?: { name?: unknown; arguments?: { tool_slug?: unknown; tools?: unknown } } } | null;
    const name = m?.params?.name;
    if (m?.method !== "tools/call" || !validName(name)) continue;

    if (DISCOVERY_TOOLS.has(name)) {
      out.push({ tool: name, via: "meta" });
      continue;
    }

    const args = m.params?.arguments;
    if (name === MULTI_EXECUTE) {
      const tools = Array.isArray(args?.tools) ? args.tools.slice(0, MULTI_EXECUTE_CAP) : [];
      // The executed tool's own name is preferred; one that is missing or out of bounds still
      // counts, under the name of the tool that carried it.
      for (const t of tools) {
        const slug = (t as { tool_slug?: unknown } | null)?.tool_slug;
        out.push({ tool: validName(slug) ? slug : name, via: "multi_execute" });
      }
      if (tools.length === 0) out.push({ tool: name, via: "multi_execute" });
      continue;
    }

    out.push({ tool: validName(args?.tool_slug) ? args.tool_slug : name, via: "direct" });
  }
  return out.slice(0, MAX_CALLS);
}
