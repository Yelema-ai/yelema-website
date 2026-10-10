import { backoffice } from "@/lib/backoffice";
import { handleError, json } from "@/lib/http";
import { mailToken, noStore } from "../../../_session";

// `GET /api/mail/{expert}/messages/{id}` — one message. Its `html` is the sender's, untouched: the
// screen only ever shows it inside a sandboxed frame (src/lib/mail.ts, sandboxedMail).
export async function GET(_request: Request, { params }: { params: Promise<{ expert: string; id: string }> }) {
  try {
    const { expert, id } = await params;
    return noStore(json(await backoffice.mailMessage(await mailToken(), expert, id)));
  } catch (e) {
    return handleError(e);
  }
}
