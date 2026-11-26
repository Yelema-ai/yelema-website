import { agent37 } from "@/lib/agent37";
import { isApprovalChoice } from "@/lib/approval";
import { requireAgentAccess } from "@/lib/auth";
import { handleError, json } from "@/lib/http";

type Ctx = { params: Promise<{ id: string; responseId: string }> };

// Answer an approval the expert asked for during the turn (card in the conversation); 409 once it no longer waits.
export async function POST(request: Request, { params }: Ctx) {
  try {
    const { id, responseId } = await params;
    await requireAgentAccess(id);
    const body = (await request.json().catch(() => null)) as { request_id?: unknown; choice?: unknown } | null;
    const requestId = typeof body?.request_id === "string" ? body.request_id.trim() : "";
    if (!requestId || requestId.length > 256 || !isApprovalChoice(body?.choice)) return json({ error: { message: "Réponse invalide." } }, 400);

    return json(await agent37.approveResponse(id, responseId, requestId, body.choice));
  } catch (e) {
    return handleError(e);
  }
}
