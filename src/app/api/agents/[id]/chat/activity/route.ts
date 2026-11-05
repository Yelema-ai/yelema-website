import { ApiError, handleError, json } from "@/lib/http";
import { spacesOf } from "@/lib/sessions-by-profile";

type Ctx = { params: Promise<{ id: string }> };

const MAX_PROFILES = 30;

// The latest routine runs of several experts of one instance (?profiles=a,b), in one call; kept for tabs
// opened before `chat/by-profile`. A profile that cannot be read is left out, not fatal.
export async function GET(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const asked = [...new Set((new URL(request.url).searchParams.get("profiles") ?? "").split(",").filter(Boolean))];
    if (asked.length > MAX_PROFILES) throw new ApiError(400, "invalid_request", "Trop d’experts demandés.");
    const spaces = await spacesOf(id, asked);
    return json({ profiles: Object.fromEntries(asked.flatMap((p) => (spaces[p] ? [[p, spaces[p].runs]] : []))) });
  } catch (e) {
    return handleError(e);
  }
}
