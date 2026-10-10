import { requireUser } from "@/lib/auth";
import { backoffice } from "@/lib/backoffice";
import { ApiError, handleError, json } from "@/lib/http";
import { authViaBackoffice } from "@/lib/runtime-config";
import { readSession } from "@/lib/session";

type Ctx = { params: Promise<{ key: string }> };

// `POST /api/catalogue/{key}/request` — a member asks for an expert they do not have. The back
// office records the request and tells Yelema's team; the app installs nothing and charges
// nothing. Open to every member. Its refusals (already in the team, unknown expert, too many
// requests) come back with their own sentence.
export async function POST(_request: Request, { params }: Ctx) {
  try {
    await requireUser();
    // Only the back office takes such a request.
    if (!authViaBackoffice()) throw new ApiError(404, "not_found", "Cette demande n’est pas disponible.");
    const { key } = await params;
    const session = await readSession();
    if (!session) throw new ApiError(401, "unauthorized", "Connectez-vous pour continuer.");
    return json(await backoffice.requestExpert(session.accessToken, key));
  } catch (e) {
    return handleError(e);
  }
}
