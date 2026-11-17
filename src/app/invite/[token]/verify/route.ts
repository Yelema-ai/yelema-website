import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { bytesToHex } from "nostr-tools/utils";
import { backoffice, BackofficeError } from "@/lib/backoffice";
import { hexToBytes } from "nostr-tools/utils";
import { DEVICE_LIMIT, guestView, INVITE_TOKEN } from "@/lib/guest-access";
import { cookieKey, guardPost, guestCookie, guestFailure, ipOf, keepGuestCookie, noStore } from "@/lib/guest-session";
import { apiError, json, readJson } from "@/lib/http";

// `POST /invite/<token>/verify` — address and code. This server makes the guest's relay key: the back office
// admits its public half in the salon only; the private half stays sealed in the guest cookie, never readable.
// A browser that still holds this invitation's cookie keeps its key: the same device, not a new one.
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const refused = guardPost(request, "verify");
  if (refused) return refused;
  try {
    const { token } = await params;
    if (!cookieKey()) return apiError("Le service est momentanément indisponible. Réessayez dans un instant.", 503, "unavailable");
    const body = await readJson<{ email?: unknown; code?: unknown }>(request);
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const code = typeof body.code === "string" ? body.code.replace(/\s/g, "") : "";
    if (!INVITE_TOKEN.test(token)) return apiError("Ce lien d’invitation n’est pas valable.", 404, "not_found");
    if (!/^\d{6}$/.test(code)) return apiError("Le code fait 6 chiffres.", 400, "invalid_code");
    if (!email) return apiError("Cette demande n’a pas pu être traitée.", 422, "invalid_request");
    const kept = await guestCookie(token);
    const secret = kept ? hexToBytes(kept.secret) : generateSecretKey();
    const opened = await backoffice.guestVerify(token, { email, code, pubkey: getPublicKey(secret) }, ipOf(request));
    return keepGuestCookie(noStore(json(guestView(opened))), { session: opened.session, secret: bytesToHex(secret) }, token, opened.expiresAt);
  } catch (e) {
    if (e instanceof BackofficeError && e.code === "invalid_code") return apiError("Code incorrect ou expiré. Vérifiez-le ou demandez-en un nouveau.", 400, "invalid_code");
    if (e instanceof BackofficeError && e.code === "device_limit") return apiError(DEVICE_LIMIT, 403, "device_limit");
    if (e instanceof BackofficeError && e.status === 400) return apiError("Une erreur est survenue, réessayez.", 400, "bad_request");
    if (e instanceof BackofficeError && e.status === 429) return apiError("Trop d’essais avec ce code. Demandez un nouveau code.", 429, "rate_limited");
    return guestFailure(e);
  }
}
