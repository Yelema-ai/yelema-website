import { backoffice } from "@/lib/backoffice";
import { INVITE_TOKEN } from "@/lib/guest-access";
import { guardPost, guestFailure, ipOf, noStore } from "@/lib/guest-session";
import { apiError, json, readJson } from "@/lib/http";

// `POST /invite/<token>/code` — sends the guest a 6-digit code; the same answer whether the address matches or not.
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const refused = guardPost(request, "code");
  if (refused) return refused;
  try {
    const { token } = await params;
    const { email } = await readJson<{ email?: unknown }>(request);
    const mail = typeof email === "string" ? email.trim().toLowerCase() : "";
    if (!INVITE_TOKEN.test(token)) return apiError("Ce lien d’invitation n’est pas valable.", 404, "not_found");
    if (!/^[^\s@]{1,64}@[^\s@]{1,190}$/.test(mail)) return apiError("Saisissez votre adresse e-mail.", 422, "invalid_email");
    await backoffice.guestCode(token, mail, ipOf(request));
    return noStore(json({ ok: true }, 202));
  } catch (e) {
    return guestFailure(e);
  }
}
