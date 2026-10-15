import { requireUser } from "@/lib/auth";
import { backoffice } from "@/lib/backoffice";
import { ApiError, handleError, json } from "@/lib/http";
import { authViaBackoffice } from "@/lib/runtime-config";
import { readSession } from "@/lib/session";

type Ctx = { params: Promise<{ key: string }> };

export async function POST(request: Request, { params }: Ctx) {
  try {
    await requireUser();
    if (!authViaBackoffice()) throw new ApiError(404, "not_found", "Cette fonctionnalité n’est pas disponible.");
    const { key } = await params;
    const session = await readSession();
    if (!session) throw new ApiError(401, "unauthorized", "Connectez-vous pour continuer.");
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    return json(await backoffice.generateExpertAvatar(session.accessToken, key, body));
  } catch (e) {
    return handleError(e);
  }
}
