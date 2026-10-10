import { backoffice } from "@/lib/backoffice";
import { handleError, json, readJson } from "@/lib/http";
import { billingToken as adminToken } from "../../billing/_admin";
import { noStore } from "../../mail/_session";

// `POST /api/org/units` — an admin creates a unit, under another or at the top.
export async function POST(request: Request) {
  try {
    const { name, parent } = await readJson<{ name: string; parent?: string | null }>(request);
    return noStore(json(await backoffice.createUnit(await adminToken(), { name, parent })));
  } catch (e) {
    return handleError(e);
  }
}
