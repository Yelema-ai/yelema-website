import { agent37 } from "@/lib/agent37";
import { requireAgentAccess } from "@/lib/auth";
import { handleError, json } from "@/lib/http";
import { profileQuery, resolveProfile } from "@/lib/profiles";
import { isMemoryRun, routineOfSession } from "@/lib/routines";
import { sessionTitle } from "@/lib/session-title";
import { isSystemSession } from "@/lib/system-sessions";
import { isVoiceSession } from "@/lib/voice-sessions";
import { undeliveredRunIds } from "@/lib/silent-runs";

type Ctx = { params: Promise<{ id: string }> };

// The thread rail of one expert (?profile=), or of the instance's default home without it. The
// Agent37 Agents API is the source of truth — GET /v1/sessions lists every conversation of that
// profile (web chat and any other channel alike); there is no local index table. We resolve each rail label here as `title || preview` (the server-side title once set,
// otherwise the first-message preview the list already carries) and order most-recently-active
// first, so the client needs no per-session fetch to label the rail.
export async function GET(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const { row } = await requireAgentAccess(id);
    const profile = await resolveProfile(row, new URL(request.url).searchParams.get("profile"));

    const query = profileQuery(profile);
    const { data } = await agent37.listSessions(id, query);
    // A routine run is a conversation only once it has delivered (Leslie, 29/10): running, nothing to
    // report, failed or not read yet, the bell has it.
    const hidden = await undeliveredRunIds(id, query, data);
    const sessions = data
      .filter((s) => !isVoiceSession(s.preview) && !hidden.has(s.id) && !isMemoryRun(s) && !isSystemSession(s))
      .map((s) => ({
        session_id: s.id,
        title: sessionTitle(s.title, s.preview),
        last_active: s.last_active ?? s.started_at ?? 0,
        // A routine's run, by the routine's name: shown as such, never as the member's own words.
        routine: routineOfSession(s),
      }))
      .sort((a, b) => b.last_active - a.last_active);

    return json({ sessions });
  } catch (e) {
    return handleError(e);
  }
}
