import { requireAgentAccess } from "@/lib/auth";
import { ApiError, handleError, json } from "@/lib/http";
import { readJourZero } from "@/lib/jour-zero-server";
import { DEFAULT_PROFILE, resolveProfile } from "@/lib/profiles";
import { upstreamErrorMessage } from "../../../_helpers";

type Ctx = { params: Promise<{ id: string; profile: string }> };

const UNAVAILABLE = "La préparation de cet expert est illisible pour l’instant. Réessayez dans un instant.";

// The expert's day-zero preparation, read from its journal in the drive (lib/jour-zero-server).
export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { id, profile: raw } = await params;
    const { row } = await requireAgentAccess(id);
    const profile = await resolveProfile(row, raw);
    if (profile === DEFAULT_PROFILE) throw new ApiError(400, "invalid_request", "Expert inconnu");
    return json(
      await readJourZero(id, profile, async (res) => {
        throw new ApiError(502, "jour_zero_unavailable", await upstreamErrorMessage(res, "jour-zero", UNAVAILABLE));
      })
    );
  } catch (e) {
    return handleError(e);
  }
}
