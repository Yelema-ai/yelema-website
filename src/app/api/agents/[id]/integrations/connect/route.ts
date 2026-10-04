import { requireAgentAccess } from "@/lib/auth";
import { connectToolkit } from "@/lib/composio";
import { ApiError, handleError, json, readJson } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

// Start connecting a tool to the workspace (Yelema's Composio): returns the provider's sign-in URL.
// The connection belongs to the workspace, so every expert can use it.
export async function POST(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const { row } = await requireAgentAccess(id, "admin");

    const { toolkit } = await readJson<{ toolkit?: string }>(request);
    if (!toolkit || typeof toolkit !== "string") {
      throw new ApiError(400, "invalid_request", "Choisissez un outil");
    }

    return json(await connectToolkit(row.workspace_id, toolkit));
  } catch (e) {
    return handleError(e);
  }
}
