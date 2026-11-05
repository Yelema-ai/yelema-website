import { ApiError, handleError, json } from "@/lib/http";
import { MAX_SPACES, spacesOf } from "@/lib/sessions-by-profile";

type Ctx = { params: Promise<{ id: string }> };

// `?profiles=default,a,b`: the rail and the routine runs of several spaces of one instance, by space
// ("" is the instance's home). The browser's one read for the menu, Conversations and the bell.
export async function GET(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const asked = [...new Set((new URL(request.url).searchParams.get("profiles") ?? "").split(","))].filter(Boolean);
    if (!asked.length || asked.length > MAX_SPACES) throw new ApiError(400, "invalid_request", "Trop d’experts demandés.");
    return json({ spaces: await spacesOf(id, asked) });
  } catch (e) {
    return handleError(e);
  }
}
