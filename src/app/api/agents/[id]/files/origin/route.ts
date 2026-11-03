import { agent37 } from "@/lib/agent37";
import { requireAgentAccess } from "@/lib/auth";
import { candidateSessions, wroteFile } from "@/lib/file-origin";
import { ApiError, handleError, json } from "@/lib/http";
import { profileQuery, resolveProfile } from "@/lib/profiles";

type Ctx = { params: Promise<{ id: string }> };

const PARALLEL = 4;

// The conversation of this Expert (?profile=) that wrote the file (?path=, ?modified= in ms), or null.
export async function GET(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const { row } = await requireAgentAccess(id);
    const url = new URL(request.url);
    const path = url.searchParams.get("path") ?? "";
    if (!path.includes("Livrables/")) throw new ApiError(400, "invalid_request", "Fichier inconnu.");
    const query = profileQuery(await resolveProfile(row, url.searchParams.get("profile")));
    const modified = Number(url.searchParams.get("modified")) || null;

    const { data } = await agent37.listSessions(id, query);
    const ids = candidateSessions(data, modified);
    for (let i = 0; i < ids.length; i += PARALLEL) {
      const found = await Promise.all(
        ids.slice(i, i + PARALLEL).map(async (s) => {
          const detail = await agent37.getSession(id, s, query).catch(() => null);
          return detail && wroteFile(detail.history ?? [], path) ? s : null;
        })
      );
      const hit = found.find(Boolean);
      if (hit) return json({ session_id: hit });
    }
    return json({ session_id: null });
  } catch (e) {
    return handleError(e);
  }
}
