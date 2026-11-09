import { backoffice, BackofficeError } from "@/lib/backoffice";
import { handleError, json } from "@/lib/http";
import { salonsNotOpen } from "@/lib/salons-closed";
import { mailToken as sessionToken, noStore } from "../../mail/_session";

// `GET /api/buzz/ouvert` — are the Salons open for this member's company? The menu shows « Salons » only then
// (Leslie, 09/11). Asked once per tab; the back office's own refusal says « pas encore ouvert ». Any other
// failure is not an answer: the browser keeps what it knew.
export async function GET() {
  try {
    const token = await sessionToken();
    try {
      await backoffice.buzz(token);
      return noStore(json({ open: true }));
    } catch (e) {
      if (e instanceof BackofficeError && salonsNotOpen(e.message)) return noStore(json({ open: false }));
      throw e;
    }
  } catch (e) {
    return handleError(e);
  }
}
