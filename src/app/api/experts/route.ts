import { requireMember, requireUser } from "@/lib/auth";
import { listInstanceProfiles } from "@/lib/hermes-profiles";
import { ApiError, handleError, json } from "@/lib/http";
import { expertDisplayName } from "@/lib/experts";
import type { AgentRow, Expert } from "@/lib/types";

// `GET /api/experts?workspace={id}` — les Experts de l'organisation, c'est-à-dire les PROFILS
// Hermes installés sur ses instances.
//
// L'agrégation se fait ici, pas dans le navigateur : un `exec` peut mettre plusieurs secondes
// (davantage si l'instance dort), et la barre latérale se charge à chaque page. Un aller-retour,
// et les instances sont interrogées en parallèle.
//
// Tolérant aux pannes partielles : une instance illisible ne fait pas disparaître les autres,
// elle est signalée dans `unreadable`. Une liste tronquée en silence serait pire qu'une erreur.
export async function GET(request: Request) {
  try {
    const { db, user } = await requireUser();
    const workspaceId = new URL(request.url).searchParams.get("workspace");
    if (!workspaceId) throw new ApiError(400, "invalid_request", "workspace query param is required");

    const role = await requireMember(db, workspaceId, user.id);

    // Même portée que la liste d'agents : un admin voit toute l'organisation, un membre son agent.
    let query = db.from("agents").select("*").eq("workspace_id", workspaceId);
    if (role !== "admin") query = query.eq("owner_user_id", user.id);
    const { data: rows, error } = await query.order("created_at", { ascending: false });
    if (error) throw new ApiError(500, "db_error", error.message);

    const agents = (rows ?? []) as AgentRow[];
    const results = await Promise.allSettled(
      agents.map((a) => listInstanceProfiles(a.agent37_id))
    );

    const experts: Expert[] = [];
    const unreadable: { agentId: string; agentName: string | null }[] = [];

    results.forEach((res, i) => {
      const agent = agents[i];
      if (res.status !== "fulfilled") {
        unreadable.push({ agentId: agent.agent37_id, agentName: agent.name });
        return;
      }
      for (const p of res.value.profiles) {
        experts.push({
          profileId: p.id,
          displayName: expertDisplayName(p.id),
          agentId: agent.agent37_id,
          agentName: agent.name,
          gateway: p.gateway,
          distribution: p.distribution,
        });
      }
    });

    experts.sort((a, b) => a.displayName.localeCompare(b.displayName, "fr"));
    return json({ experts, unreadable });
  } catch (e) {
    return handleError(e);
  }
}
