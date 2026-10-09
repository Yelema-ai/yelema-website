import { requireAgentAccess } from "@/lib/auth";
import { ApiError, handleError, json } from "@/lib/http";
import { integrations } from "@/lib/integrations";

type Ctx = { params: Promise<{ id: string; connectedAccountId: string }> };

export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    const { id, connectedAccountId } = await params;
    // The id ends up in a URL called with a workspace-wide key: only its plain form is accepted.
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(connectedAccountId ?? "")) {
      throw new ApiError(400, "invalid_request", "Compte inconnu");
    }

    const { row } = await requireAgentAccess(id);
    return json(await integrations.disconnect(row, connectedAccountId));
  } catch (e) {
    return handleError(e);
  }
}
