import { backoffice, BackofficeError } from "@/lib/backoffice";
import { answerRpc, type MemoryBackend } from "@/lib/memory-mcp";
import { authViaBackoffice } from "@/lib/runtime-config";
import { pinnedWorkspaceId } from "@/lib/tenant";
import { TenantError } from "@/lib/tenant-resolver";

// The `memoire` MCP server of the experts: the company memory, read through the back office. Each
// instance's Hermes points here with the same Bearer token as its `apps` server. This route holds
// no key and decides nothing: the back office maps the token to its member and answers only from
// the compartments the org chart opens to that member, on every call.
export const maxDuration = 120;

const MAX_BODY_BYTES = 32_768;

function errorJson(status: number, error: string): Response {
  return Response.json({ error }, { status });
}

export async function POST(request: Request): Promise<Response> {
  const token = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "")?.[1]?.trim();
  if (!token) return errorJson(401, "missing bearer token");
  if (!authViaBackoffice()) return errorJson(404, "not available");

  let workspace: string | undefined;
  try {
    workspace = await pinnedWorkspaceId();
  } catch (e) {
    return e instanceof TenantError && e.status < 500 ? errorJson(401, "invalid token") : errorJson(503, "token lookup unavailable");
  }
  if (!workspace) return errorJson(404, "not available");

  const raw = await request.text();
  let message: unknown;
  try {
    if (raw.length > MAX_BODY_BYTES) throw new Error("too large");
    message = JSON.parse(raw);
  } catch {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400 });
  }

  const backend: MemoryBackend = {
    ask: async (question) => (await backoffice.memoryAsk(token, workspace, question)).answer,
    search: async (query, limit) => (await backoffice.memorySearch(token, workspace, query, limit)).items,
  };
  try {
    const batch = Array.isArray(message) ? message.slice(0, 20) : [message];
    const answers = (await Promise.all(batch.map((m) => answerRpc(m, backend)))).filter((a) => a !== null);
    if (answers.length === 0) return new Response(null, { status: 202 });
    return Response.json(Array.isArray(message) ? answers : answers[0], { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    // Only a token the back office does not know gets here: the expert's client must see a 401.
    if (e instanceof BackofficeError && e.status === 401) return errorJson(401, "invalid token");
    console.warn("[memory-mcp] failed:", e instanceof Error ? e.message : e);
    return errorJson(502, "memory unavailable");
  }
}

// No stream and no session to close: see the same refusal in composio-mcp.
export function GET(): Response {
  return new Response(null, { status: 405, headers: { allow: "POST" } });
}
