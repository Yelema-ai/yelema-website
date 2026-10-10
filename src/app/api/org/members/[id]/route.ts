import { backoffice } from "@/lib/backoffice";
import { handleError, json, readJson } from "@/lib/http";
import { billingToken as adminToken } from "../../../billing/_admin";
import { noStore } from "../../../mail/_session";

// `PATCH /api/org/members/{id}` — an admin attaches a member to a unit and says whether they head it.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { unit, unitRole } = await readJson<{ unit?: string | null; unitRole?: "member" | "head" }>(request);
    return noStore(json(await backoffice.placeMember(await adminToken(), (await params).id, { unit, unitRole })));
  } catch (e) {
    return handleError(e);
  }
}
