import { requireAgentAccess } from "@/lib/auth";
import { ApiError, handleError } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

// Agent names (e.g. the expert profiles it carries: "Adjoua, Nadia") are set in the Yelema
// back-office, its single source of truth: the app does not rename agents.
export async function PATCH(_request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    await requireAgentAccess(id);
    throw new ApiError(403, "forbidden", "Le nom des instances est géré par Yelema.");
  } catch (e) {
    return handleError(e);
  }
}

// Agents are created and deleted by the Yelema back-office only (it also stops their billing).
export async function DELETE() {
  try {
    throw new ApiError(403, "forbidden", "Les instances sont gérées par Yelema.");
  } catch (e) {
    return handleError(e);
  }
}
