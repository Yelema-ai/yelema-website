import { backoffice } from "@/lib/backoffice";
import { PUBKEY_RE } from "@/lib/buzz";
import { handleError, json, readJson } from "@/lib/http";
import { mailToken as sessionToken, noStore } from "../../../../mail/_session";

// `POST /api/buzz/salons/<id>/membres` — adds people or experts to a salon the caller is in.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { cles } = await readJson<{ cles?: unknown }>(request);
    const keys = Array.isArray(cles) ? cles.filter((k): k is string => typeof k === "string" && PUBKEY_RE.test(k)).slice(0, 50) : [];
    return noStore(json(await backoffice.buzzAddSalonMembers(await sessionToken(), id, keys)));
  } catch (e) {
    return handleError(e);
  }
}
