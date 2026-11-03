import { agent37, instanceFetch } from "@/lib/agent37";
import { requireAgentAccess } from "@/lib/auth";
import { DRIVE_ROOT } from "@/lib/drive";
import { expertDisplayName } from "@/lib/experts";
import { ApiError, handleError, json } from "@/lib/http";
import { JOUR_ZERO_ABSENT, JOUR_ZERO_MAX_BYTES, parseJourZero } from "@/lib/jour-zero";
import { DEFAULT_PROFILE, resolveProfile } from "@/lib/profiles";
import { upstreamErrorMessage } from "../../../_helpers";

type Ctx = { params: Promise<{ id: string; profile: string }> };

const UNAVAILABLE = "La préparation de cet expert est illisible pour l’instant. Réessayez dans un instant.";

// The expert's day-zero preparation, read from its journal in the drive (the path is built here from a
// checked profile). No file, or one that is not a version-1 preparation, reads as not prepared.
export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { id, profile: raw } = await params;
    const { row } = await requireAgentAccess(id);
    const profile = await resolveProfile(row, raw);
    if (profile === DEFAULT_PROFILE) throw new ApiError(400, "invalid_request", "Expert inconnu");

    const folder = `${DRIVE_ROOT}/${expertDisplayName(profile)}`;
    const path = `${folder}/_memoire/jour-zero.json`;
    const res = await instanceFetch(id, `/v1/files/content?path=${encodeURIComponent(path)}`);
    if (res.status === 404) {
      await res.body?.cancel().catch(() => undefined);
      // An expert whose folder already holds work was there before the preparation: not « to prepare ».
      const working = await agent37
        .listFiles(id, folder)
        .then((l) => l.entries.some((e) => !e.name.startsWith(".")))
        .catch(() => false);
      return json(working ? { ...JOUR_ZERO_ABSENT, working: true } : JOUR_ZERO_ABSENT);
    }
    if (!res.ok) throw new ApiError(502, "jour_zero_unavailable", await upstreamErrorMessage(res, "jour-zero", UNAVAILABLE));
    if (Number(res.headers.get("content-length") ?? 0) > JOUR_ZERO_MAX_BYTES) {
      await res.body?.cancel().catch(() => undefined);
      console.error(`[jour-zero] oversized file on ${id}/${profile}`);
      return json(JOUR_ZERO_ABSENT);
    }

    const jz = parseJourZero(await res.text());
    if (!jz) console.error(`[jour-zero] unreadable file on ${id}/${profile}`);
    return json(jz ?? JOUR_ZERO_ABSENT);
  } catch (e) {
    return handleError(e);
  }
}
