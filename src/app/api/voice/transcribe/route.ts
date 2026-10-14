import { backoffice } from "@/lib/backoffice";
import { ApiError, handleError } from "@/lib/http";
import { noStore, voiceToken } from "../_shared";

// `POST /api/voice/transcribe` — the chat's dictation, relayed to the back office, which holds the
// speech service's key. The recording and its text only pass through.
export const maxDuration = 120;

const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const token = await voiceToken();
    if (Number(request.headers.get("content-length") ?? 0) > MAX_BYTES + 64 * 1024) throw new ApiError(422, "unprocessable", "Enregistrement trop long (environ 4 minutes au plus).");
    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof Blob)) throw new ApiError(400, "bad_request", "Enregistrement requis.");
    const out = new FormData();
    out.append("file", file, "dictee.wav");
    out.append("language", form?.get("language") === "en" ? "en" : "fr");
    return noStore(await backoffice.voiceTranscribe(token, out));
  } catch (e) {
    return handleError(e);
  }
}
