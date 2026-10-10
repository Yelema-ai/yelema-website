import { backoffice } from "@/lib/backoffice";
import { handleError, json } from "@/lib/http";
import { billingToken as adminToken } from "../../../billing/_admin";
import { noStore } from "../../../mail/_session";

// `DELETE /api/org/grants/{id}` — an admin withdraws an exception.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    return noStore(json(await backoffice.deleteGrant(await adminToken(), (await params).id)));
  } catch (e) {
    return handleError(e);
  }
}
