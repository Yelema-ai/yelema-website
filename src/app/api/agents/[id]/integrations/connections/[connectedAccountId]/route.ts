import { requireAgentAccess } from "@/lib/auth";
import { deleteConnection } from "@/lib/composio";
import { ApiError, handleError, json } from "@/lib/http";

type Ctx = { params: Promise<{ id: string; connectedAccountId: string }> };

export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    const { id, connectedAccountId } = await params;
    if (!connectedAccountId) {
      throw new ApiError(400, "invalid_request", "Compte manquant");
    }

    // Disconnecting an integration is a destructive mutation, admin-only.
    const { row } = await requireAgentAccess(id, "admin");

    return json(await deleteConnection(row.workspace_id, connectedAccountId));
  } catch (e) {
    return handleError(e);
  }
}
