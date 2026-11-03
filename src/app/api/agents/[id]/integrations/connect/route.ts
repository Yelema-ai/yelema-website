import { isAccountAlias } from "@/lib/composio";
import { requireAgentAccess } from "@/lib/auth";
import { ApiError, handleError, json, readJson } from "@/lib/http";
import { integrations } from "@/lib/integrations";

type Ctx = { params: Promise<{ id: string }> };

// Start connecting a tool: returns the provider's sign-in URL. The connection belongs to the member
// who owns the instance, so the experts on it can use it and nobody else's can.
export async function POST(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const { row } = await requireAgentAccess(id);

    const { toolkit, alias } = await readJson<{ toolkit?: string; alias?: string }>(request);
    if (!toolkit || typeof toolkit !== "string") {
      throw new ApiError(400, "invalid_request", "Choisissez un outil");
    }

    const chosen = typeof alias === "string" && alias.trim() ? alias.trim() : undefined;
    if (chosen && !isAccountAlias(chosen)) {
      throw new ApiError(400, "invalid_alias", "Nom du compte : 40 caractères au plus, lettres, chiffres, espaces, point, @, _ ou -.");
    }
    return json(await integrations.connect(row, toolkit, chosen));
  } catch (e) {
    return handleError(e);
  }
}
