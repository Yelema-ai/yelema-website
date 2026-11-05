import { backoffice, BackofficeError } from "@/lib/backoffice";
import { PUBKEY_RE } from "@/lib/buzz";
import { guestView, INVITE_TOKEN } from "@/lib/guest-access";
import { guardPost, guestFailure, ipOf, keepGuestCookie, noStore } from "@/lib/guest-session";
import { apiError, json, readJson } from "@/lib/http";

// `POST /invite/<token>/verify` — the code and this browser's public key (its private half never leaves the
// browser); the back office admits the key in the salon and opens a session, kept in the guest cookie only.
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const refused = guardPost(request, "verify");
  if (refused) return refused;
  try {
    const { token } = await params;
    const body = await readJson<{ email?: unknown; code?: unknown; pubkey?: unknown }>(request);
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const code = typeof body.code === "string" ? body.code.replace(/\s/g, "") : "";
    const pubkey = typeof body.pubkey === "string" ? body.pubkey : "";
    if (!INVITE_TOKEN.test(token)) return apiError("Ce lien d’invitation n’est pas valable.", 404, "not_found");
    if (!/^\d{6}$/.test(code)) return apiError("Le code fait 6 chiffres.", 400, "invalid_code");
    if (!email || !PUBKEY_RE.test(pubkey)) return apiError("Cette demande n’a pas pu être traitée.", 422, "invalid_request");
    const opened = await backoffice.guestVerify(token, { email, code, pubkey }, ipOf(request));
    return keepGuestCookie(noStore(json(guestView(opened))), opened.session, token, opened.expiresAt);
  } catch (e) {
    if (e instanceof BackofficeError && e.code === "invalid_code") return apiError("Code incorrect ou expiré. Vérifiez-le ou demandez-en un nouveau.", 400, "invalid_code");
    if (e instanceof BackofficeError && e.status === 400) return apiError("Une erreur est survenue, réessayez.", 400, "bad_request");
    if (e instanceof BackofficeError && e.status === 429) return apiError("Trop d’essais avec ce code. Demandez un nouveau code.", 429, "rate_limited");
    return guestFailure(e);
  }
}
