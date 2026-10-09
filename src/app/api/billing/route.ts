import { backoffice } from "@/lib/backoffice";
import { handleError, json } from "@/lib/http";
import { billingToken } from "./_admin";

// `GET /api/billing` — the workspace's plan, its next due date and its invoices, for its admins.
// Read from the back office on every call: an invoice paid a minute ago must show as paid.
export async function GET() {
  try {
    const token = await billingToken();
    const [billing, invoices] = await Promise.all([backoffice.billing(token), backoffice.invoices(token)]);
    const res = json({ billing, invoices });
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch (e) {
    return handleError(e);
  }
}
