import { tokenLimit } from "@/lib/instance-limits";
import { composioUserId } from "@/lib/composio";
import { instanceBearer } from "@/lib/profile-token";
import { profileTokenAccounts } from "@/lib/profile-token-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pinnedWorkspaceId } from "@/lib/tenant";
import { TenantError } from "@/lib/tenant-resolver";
import { createYeleSupervisionBackend } from "@/lib/yele-mcp/backend";
import { inBatches } from "@/lib/yele-mcp/python-reader";
import { answerRpc } from "@/lib/yele-mcp/rpc";
import { asService } from "@/lib/service-call";
import { yeleSupervisionDeps } from "@/lib/yele-mcp/instance";

// Yélé's supervision server (MCP): a read-only view of the whole instance (experts, conversations,
// routines, usage, connectors, channels, deliverables, memory). What it reads is in lib/yele-mcp/instance.
export const maxDuration = 120;
const MAX_BODY_BYTES = 32_768;
const limit = tokenLimit(300);

function errorJson(status: number, error: string): Response {
  return Response.json({ error }, { status });
}

/** Corps de la requête en texte ; null s'il dépasse `MAX_BODY_BYTES` octets, annoncés ou lus. */
async function boundedBody(request: Request): Promise<string | null> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

export const POST = (request: Request): Promise<Response> => asService("yele-mcp", () => answer(request));

async function answer(request: Request): Promise<Response> {
  // Yélé's instance calls with its own token, as for `apps` and `memoire`; no browser session.
  const token = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "")?.[1]?.trim();
  if (!token) return errorJson(401, "missing bearer token");
  const wait = limit(token);
  if (wait !== null) return new Response(JSON.stringify({ error: "too many requests" }), { status: 429, headers: { "content-type": "application/json", "retry-after": String(wait) } });
  const bearer = instanceBearer(token);
  if (!bearer) return errorJson(401, "invalid token");

  let pinned: string | undefined;
  try {
    pinned = await pinnedWorkspaceId();
  } catch (e) {
    return e instanceof TenantError && e.status < 500 ? errorJson(401, "invalid token") : errorJson(503, "token lookup unavailable");
  }
  const { data: agent, error } = await createAdminClient()
    .from("agents")
    .select("agent37_id, workspace_id, owner_user_id")
    .eq("apps_token_hash", bearer.hash)
    .maybeSingle<{ agent37_id: string; workspace_id: string | null; owner_user_id: string | null }>();
  if (error) return errorJson(503, "token lookup unavailable");
  if (!agent?.agent37_id || (pinned && agent.workspace_id !== pinned)) return errorJson(401, "invalid token");
  // A profile token found the instance by a hash that proves nothing: the back office checks its seal first.
  if (bearer.profile) {
    const vouched = agent.workspace_id ? await profileTokenAccounts(token, agent.workspace_id).catch(() => undefined) : null;
    if (vouched === undefined) return errorJson(503, "token lookup unavailable");
    if (!vouched) return errorJson(401, "invalid token");
  }

  const raw = await boundedBody(request);
  if (raw === null) {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Request too large" } }, { status: 413 });
  }
  let message: unknown;
  try {
    message = JSON.parse(raw);
  } catch {
    return Response.json(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
      { status: 400 }
    );
  }

  const backend = createYeleSupervisionBackend(yeleSupervisionDeps(agent.agent37_id, composioUserId(agent)));

  try {
    const batch = Array.isArray(message) ? message.slice(0, 20) : [message];
    // Each tool is an exec on the instance: a batch runs three at a time, not twenty.
    const answers = (await inBatches(batch.map((m) => () => answerRpc(m, backend)), 3)).filter((a) => a !== null);
    if (answers.length === 0) return new Response(null, { status: 202 });
    return Response.json(Array.isArray(message) ? answers : answers[0], {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    console.warn("[yele-mcp] Erreur lors du traitement RPC:", e instanceof Error ? e.message : e);
    return errorJson(500, "Erreur interne du serveur de supervision.");
  }
}

export function GET(): Response {
  return new Response(null, { status: 405, headers: { allow: "POST" } });
}
