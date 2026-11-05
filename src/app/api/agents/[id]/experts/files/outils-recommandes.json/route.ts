import { agent37 } from "@/lib/agent37";
import { requireAgentAccess } from "@/lib/auth";
import { parseGroupedToolsFiles } from "@/lib/expert-tools";
import { ApiError, handleError, json } from "@/lib/http";
import { optionalRoute } from "@/lib/optional-route";
import { DEFAULT_PROFILE, resolveProfile } from "@/lib/profiles";

type Ctx = { params: Promise<{ id: string }> };

const MAX_PROFILES = 40;
// An instance whose gateway lacks the grouped read is not asked it again for a while.
const grouped = optionalRoute((id: string, profiles: string[]) => agent37.expertFiles(id, profiles, "outils-recommandes.json"), { key: (id) => id });

// `?profiles=a,b`: the recommended tools of several experts in one call to the gateway. A 404 says the
// gateway has no grouped read (the browser then reads each expert alone); a profile missing from the
// answer is read alone too.
export async function GET(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const asked = [...new Set((new URL(request.url).searchParams.get("profiles") ?? "").split(","))].filter(Boolean);
    if (!asked.length || asked.length > MAX_PROFILES) throw new ApiError(400, "invalid_request", "Trop d’experts demandés.");
    const { row } = await requireAgentAccess(id);
    const profiles = (await Promise.all(asked.map((p) => resolveProfile(row, p).catch(() => null)))).filter((p): p is string => !!p && p !== DEFAULT_PROFILE);
    if (!profiles.length) return json({ tools: {} });
    const body = await grouped(id, profiles);
    if (body === null) throw new ApiError(404, "not_found", "Lecture groupée indisponible");
    return json({ tools: Object.fromEntries(parseGroupedToolsFiles(body, profiles)) });
  } catch (e) {
    return handleError(e);
  }
}
