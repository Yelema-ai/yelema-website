import { backoffice } from "@/lib/backoffice";
import { handleError, json, readJson } from "@/lib/http";
import type { MailDraft } from "@/lib/mail";
import { mailToken, noStore } from "../../../../_session";

export const maxDuration = 120;

// `POST /api/mail/{expert}/messages/{id}/reply` — an answer in the thread, to the message's sender.
export async function POST(request: Request, { params }: { params: Promise<{ expert: string; id: string }> }) {
  try {
    const { expert, id } = await params;
    const { text, attachments } = await readJson<Pick<MailDraft, "text" | "attachments">>(request);
    return noStore(json(await backoffice.mailReply(await mailToken(), expert, id, { text, attachments })));
  } catch (e) {
    return handleError(e);
  }
}
