import { requireAgentAccess } from "@/lib/auth";
import { handleError, json } from "@/lib/http";
import { integrations } from "@/lib/integrations";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const { row } = await requireAgentAccess(id);

    const search = new URL(request.url).searchParams.get("search")?.trim() || undefined;
    return json(await integrations.toolkits(row, search));
  } catch (e) {
    return handleError(e);
  }
}
