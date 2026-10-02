import { requireAgentAccess } from "@/lib/auth";
import { listInstanceProfiles } from "@/lib/hermes-profiles";
import { handleError, json } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

// `GET /api/agents/{id}/profiles` — les profils Hermes installés sur cette instance.
// Lecture seule, et lecture d'une COPIE : l'Expert est écrit dans le control-plane, qui projette
// le profil ici. Accès « member » : lire les profils n'est pas une mutation.
export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    await requireAgentAccess(id);

    return json(await listInstanceProfiles(id));
  } catch (e) {
    return handleError(e);
  }
}
