import { requireAgentAccess } from "@/lib/auth";
import { listConnections } from "@/lib/composio";
import { handleError, json } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const { row } = await requireAgentAccess(id, "member");

    return json(await listConnections(row.workspace_id));
  } catch (e) {
    return handleError(e);
  }
}
