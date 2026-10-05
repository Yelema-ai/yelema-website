import { agent37, Agent37Error } from "@/lib/agent37";
import { requireAgentAccess } from "@/lib/auth";
import { ApiError, handleError, json, readJson } from "@/lib/http";
import { profileQuery, resolveProfile } from "@/lib/profiles";
import type { AgentRow } from "@/lib/types";

// The thread belongs to one expert's profile (?profile=), or to the default home without it.
async function profileOf(request: Request, row: AgentRow): Promise<string> {
  return profileQuery(await resolveProfile(row, new URL(request.url).searchParams.get("profile")));
}

type Ctx = { params: Promise<{ id: string; sessionId: string }> };

// Full conversation history for a thread (source of truth lives on the instance). Also used by
// the rail to derive a thread's label from its first message.
export async function GET(request: Request, { params }: Ctx) {
  try {
    const { id, sessionId } = await params;
    const { row } = await requireAgentAccess(id);

    return json(await agent37.getSession(id, sessionId, await profileOf(request, row)));
  } catch (e) {
    return handleError(e);
  }
}

// Rename a thread (PATCH /v1/sessions/{id} on the instance). Newer Hermes builds store a title;
// builds without title support answer 404/405, which we translate into a clear 501 so the rail
// can roll back its optimistic rename and tell the user instead of failing opaquely.
export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const { id, sessionId } = await params;
    const { row } = await requireAgentAccess(id);
    const query = await profileOf(request, row);

    const { title } = await readJson<{ title?: string }>(request);
    const trimmed = (title ?? "").trim();
    if (!trimmed) throw new ApiError(400, "invalid_request", "title is required");

    try {
      return json(await agent37.renameSession(id, sessionId, trimmed.slice(0, 200), query));
    } catch (e) {
      if (e instanceof Agent37Error && (e.status === 404 || e.status === 405)) {
        throw new ApiError(501, "rename_unsupported", "Renaming chats isn't supported on this agent build yet.");
      }
      throw e;
    }
  } catch (e) {
    return handleError(e);
  }
}

// Delete a conversation on the instance. The Agents API owns the session lifecycle — there
// is no local index row to clean up, so the upstream call is the one that surfaces.
export async function DELETE(request: Request, { params }: Ctx) {
  try {
    const { id, sessionId } = await params;
    const { row } = await requireAgentAccess(id);

    return json(await agent37.deleteSession(id, sessionId, await profileOf(request, row)));
  } catch (e) {
    return handleError(e);
  }
}
