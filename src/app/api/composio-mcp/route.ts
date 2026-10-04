import { createAdminClient } from "@/lib/supabase/admin";
import { hashAppsToken, mintMcpSession, type McpSession } from "@/lib/composio";

// The MCP proxy between the experts and Yelema's Composio: the only place their tool traffic meets
// the key. Each instance's Hermes has an `apps` MCP server pointed here with its own Bearer token
// (the yelema-hermes image writes it into every profile from ~/.yelema/apps-mcp.json). The token
// maps to the instance's workspace, and the request is forwarded to a Composio tool session scoped
// to that workspace, so a client only ever reaches its own connected accounts.
// Adapted from agent37-platform/hermes-openclaw-composio.
export const maxDuration = 300;

const FORWARD_REQUEST_HEADERS = ["content-type", "accept", "mcp-session-id", "mcp-protocol-version", "last-event-id"] as const;
const FORWARD_RESPONSE_HEADERS = ["content-type", "mcp-session-id", "mcp-protocol-version"] as const;

// One Composio session per workspace, minted once per server instance and reused until Composio
// answers 404 (evicted) or 401 (key changed); then it is re-minted and the request replayed once.
const sessions = new Map<string, McpSession>();
const minting = new Map<string, Promise<McpSession>>();

function getSession(workspaceId: string): Promise<McpSession> {
  const cached = sessions.get(workspaceId);
  if (cached) return Promise.resolve(cached);
  let inflight = minting.get(workspaceId);
  if (!inflight) {
    inflight = mintMcpSession(workspaceId)
      .then((session) => {
        sessions.set(workspaceId, session);
        return session;
      })
      .finally(() => minting.delete(workspaceId));
    minting.set(workspaceId, inflight);
  }
  return inflight;
}

function forward(session: McpSession, request: Request, body: ArrayBuffer | undefined): Promise<Response> {
  const headers: Record<string, string> = { ...session.headers };
  for (const name of FORWARD_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers[name] = value;
  }
  // redirect: "manual", or fetch would carry the Composio key across a cross-origin redirect.
  return fetch(session.url, {
    method: request.method,
    headers,
    body: request.method === "POST" ? body : undefined,
    redirect: "manual",
    cache: "no-store",
  });
}

function errorJson(status: number, error: string): Response {
  return Response.json({ error }, { status });
}

async function handle(request: Request): Promise<Response> {
  const token = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "")?.[1]?.trim();
  if (!token) return errorJson(401, "missing bearer token");

  const { data: row, error } = await createAdminClient()
    .from("agents")
    .select("workspace_id")
    .eq("apps_token_hash", hashAppsToken(token))
    .maybeSingle<{ workspace_id: string }>();
  // A database outage must not look like a revoked token to the expert.
  if (error) return errorJson(503, "token lookup unavailable");
  if (!row) return errorJson(401, "invalid token");
  const workspaceId = row.workspace_id;

  const body = request.method === "POST" ? await request.arrayBuffer() : undefined;
  try {
    let upstream = await forward(await getSession(workspaceId), request, body);
    if (upstream.status === 404 || upstream.status === 401) {
      sessions.delete(workspaceId);
      upstream = await forward(await getSession(workspaceId), request, body);
    }
    if (upstream.status >= 300 && upstream.status < 400) return errorJson(502, "upstream redirect refused");

    const headers = new Headers();
    for (const name of FORWARD_RESPONSE_HEADERS) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch (e) {
    console.warn(`[composio-mcp] ${workspaceId} proxy failed:`, e instanceof Error ? e.message : e);
    return errorJson(502, "composio upstream unavailable");
  }
}

export { handle as POST, handle as DELETE };

// The optional standalone GET stream (server push) is refused: every MCP client opens it at connect
// and holds it, which would park one serverless function per expert for a channel nothing uses.
// It must stay a clean 405; a stream accepted then closed sends MCP clients into a reconnect loop.
export function GET(): Response {
  return new Response(null, { status: 405, headers: { allow: "POST, DELETE" } });
}
