import { backoffice } from "@/lib/backoffice";
import { handleError, json, readJson } from "@/lib/http";
import { echangesVisible } from "@/lib/runtime-config";
import { guestFormError, parseGuestEmails } from "@/lib/salon-guests";
import { mailToken as sessionToken, noStore } from "../../../../mail/_session";

// `GET|POST /api/buzz/salons/<id>/guests` — a salon's external guests, and inviting some (the back office
// checks the salon's creator or an admin, the client's domains, and sends the e-mails).
const SALON = /^[0-9a-f-]{36}$/;
const off = () => json({ error: { code: "not_found", message: "Ce salon est introuvable." } }, 404);

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!echangesVisible() || !SALON.test(id)) return off();
    return noStore(json(await backoffice.buzzSalonGuests(await sessionToken(), id)));
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!echangesVisible() || !SALON.test(id)) return off();
    const { emails, days } = await readJson<{ emails?: unknown; days?: unknown }>(request);
    const text = Array.isArray(emails) ? emails.filter((e): e is string => typeof e === "string").join(" ") : "";
    const refused = guestFormError(text, days);
    if (refused) return json({ error: { code: "invalid_request", message: refused } }, 422);
    return noStore(json(await backoffice.buzzInviteGuests(await sessionToken(), id, { emails: parseGuestEmails(text).emails, days: days as number })));
  } catch (e) {
    return handleError(e);
  }
}
