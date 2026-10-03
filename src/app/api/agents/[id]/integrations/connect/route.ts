import { agent37, Agent37Error } from "@/lib/agent37";
import { requireAgentAccess } from "@/lib/auth";
import { ApiError, handleError, json, readJson } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

// Start connecting a tool (Composio, managed by Agent37) to the workspace instance: returns the
// provider's sign-in URL. The connection belongs to the instance, so every expert can use it.
export async function POST(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    await requireAgentAccess(id, "admin");

    const { toolkit } = await readJson<{ toolkit?: string }>(request);
    if (!toolkit || typeof toolkit !== "string") {
      throw new ApiError(400, "invalid_request", "Choisissez un outil");
    }

    try {
      return json(await agent37.connectIntegration(id, { toolkit }));
    } catch (e) {
      // A tool without a managed sign-in (it wants an API key or a custom app) cannot be connected here.
      if (e instanceof Agent37Error && e.code === "custom_auth_required") {
        throw new ApiError(422, e.code, "Cet outil ne se connecte pas encore depuis Yelema. Écrivez-nous pour l’activer.");
      }
      if (e instanceof Agent37Error) {
        console.error(`[integrations] connect ${toolkit} failed on ${id}`, e.status, e.message);
        throw new ApiError(e.status, e.code, "La connexion n’a pas pu démarrer. Réessayez dans un instant.");
      }
      throw e;
    }
  } catch (e) {
    return handleError(e);
  }
}
