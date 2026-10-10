import { backoffice } from "@/lib/backoffice";
import { handleError, json, readJson } from "@/lib/http";
import type { OrgGrantDraft } from "@/lib/memory";
import { billingToken as adminToken } from "../../billing/_admin";
import { noStore } from "../../mail/_session";

// `POST /api/org/grants` — an admin opens a unit's compartment to one person or to another unit.
export async function POST(request: Request) {
  try {
    return noStore(json(await backoffice.createGrant(await adminToken(), await readJson<OrgGrantDraft>(request))));
  } catch (e) {
    return handleError(e);
  }
}
