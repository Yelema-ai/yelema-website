import { backoffice } from "@/lib/backoffice";
import { ApiError, handleError } from "@/lib/http";
import { callHeaders } from "@/lib/voice";
import { noStore, signalingBody, voiceToken } from "../_shared";

// `POST /api/voice/calls` — the SDK's "connect": opens the call with the expert, language and voice
// the browser names in X-Yelema-*. The SDK's agent_id is ignored by the back office.
export async function POST(request: Request) {
  try {
    const headers = callHeaders(request.headers);
    if (!headers) throw new ApiError(400, "bad_request", "Cette demande n’a pas pu être traitée.");
    return noStore(await backoffice.voiceStart(await voiceToken(), headers, await signalingBody(request)));
  } catch (e) {
    return handleError(e);
  }
}
