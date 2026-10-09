import { requireMember, requireUser } from "@/lib/auth";
import { ApiError, handleError, json } from "@/lib/http";
import { userExperts, visibleAgents } from "@/lib/installed-experts";

// `GET /api/experts?workspace={id}` — les Experts de l'utilisateur, c'est-à-dire les PROFILS
// Hermes installés sur SON instance. Un admin n'en voit pas plus qu'un membre.
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

    await requireMember(db, workspaceId, user.id);
    return json(await userExperts(await visibleAgents(db, workspaceId, user.id)));
  } catch (e) {
    return handleError(e);
  }
}
