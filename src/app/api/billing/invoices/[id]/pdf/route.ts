import { backoffice } from "@/lib/backoffice";
import { handleError } from "@/lib/http";
import { billingToken } from "../../../_admin";

type Ctx = { params: Promise<{ id: string }> };

// `GET /api/billing/invoices/{id}/pdf` — one invoice's PDF, piped from the back office. Always a
// download of a PDF, whatever the back office labels it: nothing here is shown in the page.
export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const upstream = await backoffice.invoicePdf(await billingToken(), id);
    const headers = new Headers({
      "Content-Type": "application/pdf",
      "Content-Disposition": upstream.headers.get("Content-Disposition") ?? `attachment; filename="facture-${id}.pdf"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    const length = upstream.headers.get("Content-Length");
    if (length) headers.set("Content-Length", length);
    return new Response(upstream.body, { status: 200, headers });
  } catch (e) {
    return handleError(e);
  }
}
