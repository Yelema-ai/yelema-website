import { requireUser } from "@/lib/auth";
import { loadCatalogueExpert } from "@/lib/catalogue";
import { ApiError, handleError, json } from "@/lib/http";

type Ctx = { params: Promise<{ key: string }> };

// `GET /api/catalogue/{key}` — one expert's full presentation (the "fiche"): what it does, its
// skills, example deliverables, video. Public content, but served to signed-in users only.
export async function GET(_request: Request, { params }: Ctx) {
  try {
    await requireUser();
    const { key } = await params;
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(key)) throw new ApiError(404, "not_found", "Expert introuvable");

    const expert = await loadCatalogueExpert(key);
    if (!expert) throw new ApiError(404, "not_found", "Expert introuvable");
    return json({ expert });
  } catch (e) {
    return handleError(e);
  }
}
