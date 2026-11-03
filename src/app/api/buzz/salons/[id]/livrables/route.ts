import { backoffice } from "@/lib/backoffice";
import { handleError, json } from "@/lib/http";
import { mailToken as sessionToken, noStore } from "../../../../mail/_session";

// `GET /api/buzz/salons/<id>/livrables` — the salon's deliverables; the back office checks the caller is in the salon.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!/^[0-9a-f-]{36}$/.test(id)) return noStore(json({ items: [] }));
    return noStore(json(await backoffice.buzzSalonDeliverables(await sessionToken(), id)));
  } catch (e) {
    return handleError(e);
  }
}
