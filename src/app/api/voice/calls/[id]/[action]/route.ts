import { backoffice } from "@/lib/backoffice";
import { ApiError, handleError } from "@/lib/http";
import { signalingStep } from "@/lib/voice";
import { noStore, signalingBody, voiceToken } from "../../../_shared";

// `/api/voice/calls/{id}/{offer|ice|status|end|feedback}` — the call's signaling, relayed as is.
// Only the member who opened the call reaches it at the back office.
async function relay(request: Request, params: Promise<{ id: string; action: string }>) {
  try {
    const { id, action } = await params;
    const step = signalingStep(id, action, request.method);
    if (!step) throw new ApiError(404, "not_found", "Cet appel est introuvable.");
    const body = request.method === "GET" ? undefined : await signalingBody(request);
    return noStore(await backoffice.voiceSignal(await voiceToken(), id, step, body));
  } catch (e) {
    return handleError(e);
  }
}

type Ctx = { params: Promise<{ id: string; action: string }> };
export const GET = (request: Request, { params }: Ctx) => relay(request, params);
export const POST = (request: Request, { params }: Ctx) => relay(request, params);
export const PATCH = (request: Request, { params }: Ctx) => relay(request, params);
