import { backoffice } from "@/lib/backoffice";
import { handleError } from "@/lib/http";
import { noStore, voiceToken } from "../_shared";

// `GET /api/voice/voices` — the voices a member may pick for their calls. A 404 means calls are off.
export async function GET() {
  try {
    return noStore({ items: await backoffice.voiceVoices(await voiceToken()) });
  } catch (e) {
    return handleError(e);
  }
}
