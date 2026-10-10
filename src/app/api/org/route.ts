import { backoffice } from "@/lib/backoffice";
import { handleError, json } from "@/lib/http";
import { billingToken as adminToken } from "../billing/_admin";
import { noStore } from "../mail/_session";

// `GET /api/org` — for the workspace's admins: units, where each member sits, and the exceptions.
export async function GET() {
  try {
    return noStore(json(await backoffice.org(await adminToken())));
  } catch (e) {
    return handleError(e);
  }
}
