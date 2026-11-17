import { backoffice } from "@/lib/backoffice";
import { handleError, json } from "@/lib/http";
import { echangesVisible } from "@/lib/runtime-config";
import { mailToken as sessionToken, noStore } from "../../../../../../mail/_session";

// `DELETE /api/buzz/salons/<id>/guests/<guestId>/devices` — disconnects every device of a guest (who stays invited).
type Ctx = { params: Promise<{ id: string; guestId: string }> };
const SALON = /^[0-9a-f-]{36}$/;
const GUEST = /^[A-Za-z0-9_-]{1,64}$/;

export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    const { id, guestId } = await params;
    if (!echangesVisible() || !SALON.test(id) || !GUEST.test(guestId)) return json({ error: { code: "not_found", message: "Cette invitation est introuvable." } }, 404);
    await backoffice.buzzResetGuestDevices(await sessionToken(), id, guestId);
    return noStore(json({ ok: true }));
  } catch (e) {
    return handleError(e);
  }
}
