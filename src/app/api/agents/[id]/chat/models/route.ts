import { agent37 } from "@/lib/agent37";
import { requireAgentAccess } from "@/lib/auth";
import { handleError, json } from "@/lib/http";
import { profileQuery, resolveProfile } from "@/lib/profiles";

type Ctx = { params: Promise<{ id: string }> };

// List the models this agent can run, for the composer's model switcher.
export async function GET(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const { row } = await requireAgentAccess(id);
    const profile = await resolveProfile(row, new URL(request.url).searchParams.get("profile"));

    return json(await agent37.listModels(id, profileQuery(profile)));
  } catch (e) {
    return handleError(e);
  }
}
