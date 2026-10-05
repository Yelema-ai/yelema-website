import { requireMember, requireUser } from "@/lib/auth";
import { loadCatalogue, matchCatalogue } from "@/lib/catalogue";
import { expertDisplayName } from "@/lib/experts";
import { ApiError, handleError, json } from "@/lib/http";
import { installedProfiles, visibleAgents } from "@/lib/installed-experts";
import type { Expert } from "@/lib/types";

// `GET /api/experts?workspace={id}` — les Experts de l'utilisateur, c'est-à-dire les PROFILS
// Hermes installés sur ses instances (toutes celles de l'organisation pour un admin).
//
// L'agrégation se fait ici, pas dans le navigateur : la barre latérale se charge à chaque page.
// Chaque profil est ensuite habillé par le catalogue du back-office (nom, métier, portrait) ;
// sans catalogue, on affiche le nom tiré de l'identifiant du profil.
//
// Tolérant aux pannes partielles : une instance illisible ne fait pas disparaître les autres,
// elle est signalée dans `unreadable`. Une liste tronquée en silence serait pire qu'une erreur.
export async function GET(request: Request) {
  try {
    const { db, user } = await requireUser();
    const workspaceId = new URL(request.url).searchParams.get("workspace");
    if (!workspaceId) throw new ApiError(400, "invalid_request", "workspace query param is required");

    const role = await requireMember(db, workspaceId, user.id);
    const agents = await visibleAgents(db, workspaceId, user.id, role);
    const [{ profiles, unreadable }, catalogue] = await Promise.all([installedProfiles(agents), loadCatalogue()]);

    const experts: Expert[] = profiles.map((p) => {
      const entry = matchCatalogue(catalogue.experts, p.profileId);
      return {
        profileId: p.profileId,
        displayName: entry?.name ?? expertDisplayName(p.profileId),
        agentId: p.agent.agent37_id,
        agentName: p.agent.name,
        gateway: p.gateway,
        distribution: p.distribution,
        catalogueKey: entry?.key ?? null,
        role: entry?.role ?? null,
        title: entry?.title ?? null,
        tagline: entry?.tagline ?? null,
        photoUrl: entry?.avatarUrl ?? null,
        driveFolder: entry?.driveFolder ?? entry?.name ?? null,
      };
    });

    experts.sort((a, b) => a.displayName.localeCompare(b.displayName, "fr"));
    return json({
      experts,
      unreadable: unreadable.map((a) => ({ agentId: a.agent37_id, agentName: a.name })),
    });
  } catch (e) {
    return handleError(e);
  }
}
