import { requireAgentAccess } from "@/lib/auth";
import { handleError, json } from "@/lib/http";
import { integrations } from "@/lib/integrations";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const { row } = await requireAgentAccess(id);

    return json(await integrations.connections(row));
  } catch (e) {
    return handleError(e);
  }
}
