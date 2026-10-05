import { requireAgentAccess } from "@/lib/auth";
import { ApiError, handleError, json } from "@/lib/http";
import { integrations } from "@/lib/integrations";

type Ctx = { params: Promise<{ id: string; connectedAccountId: string }> };

export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    const { id, connectedAccountId } = await params;
    if (!connectedAccountId) {
      throw new ApiError(400, "invalid_request", "Compte manquant");
    }

    const { row } = await requireAgentAccess(id);
    return json(await integrations.disconnect(row, connectedAccountId));
  } catch (e) {
    return handleError(e);
  }
}
