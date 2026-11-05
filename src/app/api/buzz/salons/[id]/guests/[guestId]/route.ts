import { backoffice } from "@/lib/backoffice";
import { handleError, json, readJson } from "@/lib/http";
import { echangesVisible } from "@/lib/runtime-config";
import { isGuestDays } from "@/lib/salon-guests";
import { mailToken as sessionToken, noStore } from "../../../../../mail/_session";

// `PATCH /api/buzz/salons/<id>/guests/<guestId>` extends a guest's access (`days` from today); `DELETE` withdraws it.
type Ctx = { params: Promise<{ id: string; guestId: string }> };
const SALON = /^[0-9a-f-]{36}$/;
const GUEST = /^[A-Za-z0-9_-]{1,64}$/;
const off = () => json({ error: { code: "not_found", message: "Cette invitation est introuvable." } }, 404);

export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const { id, guestId } = await params;
    if (!echangesVisible() || !SALON.test(id) || !GUEST.test(guestId)) return off();
    const { days } = await readJson<{ days?: unknown }>(request);
    if (!isGuestDays(days)) return json({ error: { code: "invalid_request", message: "Choisissez une durée d’accès : 30, 90 ou 180 jours." } }, 422);
    return noStore(json(await backoffice.buzzExtendGuest(await sessionToken(), id, guestId, days)));
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    const { id, guestId } = await params;
    if (!echangesVisible() || !SALON.test(id) || !GUEST.test(guestId)) return off();
    await backoffice.buzzRemoveGuest(await sessionToken(), id, guestId);
    return noStore(json({ ok: true }));
  } catch (e) {
    return handleError(e);
  }
}
