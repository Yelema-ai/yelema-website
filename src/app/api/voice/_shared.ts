import { boundedText } from "@/lib/bounded-body";
import { ApiError } from "@/lib/http";

// An SDP offer, an ICE candidate, a feedback: a few KB.
const MAX_SIGNALING_BYTES = 256 * 1024;
import { requireBackofficeToken } from "@/lib/auth";

// Voice calls are the back office's: these routes only relay the browser's signaling with the
// member's session and the request's workspace. It checks the member, the expert and the voice.
export const voiceToken = (): Promise<string> => requireBackofficeToken("Les appels vocaux ne sont pas disponibles.");

/** The SDK's JSON body, or undefined when it sends none. */
export async function signalingBody(request: Request): Promise<unknown> {
  const text = await boundedText(request, MAX_SIGNALING_BYTES);
  if (text === null) throw new ApiError(413, "too_large", "Cette demande n’a pas pu être traitée.");
  if (!text.trim()) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(400, "bad_request", "Cette demande n’a pas pu être traitée.");
  }
}

export { noStore } from "@/lib/http";
