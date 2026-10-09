import { backoffice } from "@/lib/backoffice";
import { ApiError, handleError, json } from "@/lib/http";
import { billingToken } from "../../../_admin";

type Ctx = { params: Promise<{ id: string }> };

// `POST /api/billing/invoices/{id}/payment-link` — where this invoice is paid: the back office's
// own payment page. The app creates no payment; it only passes the link on.
export async function POST(_request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const { url } = await backoffice.paymentLink(await billingToken(), id);
    // The browser is about to open it: a web address over TLS, nothing else.
    let https = false;
    try {
      https = new URL(url).protocol === "https:";
    } catch {}
    if (!https) {
      console.error("[billing] unusable payment link for", id);
      throw new ApiError(502, "payment_unavailable", "Le paiement en ligne est indisponible pour le moment. Réessayez dans un instant.");
    }
    return json({ url });
  } catch (e) {
    return handleError(e);
  }
}
