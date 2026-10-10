import { backoffice } from "@/lib/backoffice";
import { handleError, json } from "@/lib/http";
import { billingToken } from "../../billing/_admin";
import { noStore } from "../_session";

// `GET /api/mail/rights` — for the workspace's admins: every expert's inbox and its three settings.
export async function GET() {
  try {
    return noStore(json({ items: await backoffice.mailRights(await billingToken()) }));
  } catch (e) {
    return handleError(e);
  }
}
