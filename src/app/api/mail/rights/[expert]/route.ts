import { backoffice } from "@/lib/backoffice";
import { handleError, json, readJson } from "@/lib/http";
import type { MailRightsPatch } from "@/lib/mail";
import { billingToken } from "../../../billing/_admin";
import { noStore } from "../../_session";

// `PUT /api/mail/rights/{expert}` — an admin sets an inbox: whether the expert may send, which
// members it is restricted to, and whether it may write outside the company. Only the fields given
// change; the back office checks each of them.
export async function PUT(request: Request, { params }: { params: Promise<{ expert: string }> }) {
  try {
    const { expert } = await params;
    const { sendEnabled, senders, externalAllowed } = await readJson<MailRightsPatch>(request);
    return noStore(json(await backoffice.setMailRights(await billingToken(), expert, { sendEnabled, senders, externalAllowed })));
  } catch (e) {
    return handleError(e);
  }
}
