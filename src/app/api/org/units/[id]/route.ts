import { backoffice } from "@/lib/backoffice";
import { handleError, json, readJson } from "@/lib/http";
import { billingToken as adminToken } from "../../../billing/_admin";
import { noStore } from "../../../mail/_session";

// `PATCH` / `DELETE /api/org/units/{id}` — an admin renames, moves or deletes a unit. The back
// office refuses a move under itself and the deletion of a unit that still has members or deposits.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { name, parent } = await readJson<{ name?: string; parent?: string | null }>(request);
    return noStore(json(await backoffice.updateUnit(await adminToken(), (await params).id, { name, parent })));
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    return noStore(json(await backoffice.deleteUnit(await adminToken(), (await params).id)));
  } catch (e) {
    return handleError(e);
  }
}
