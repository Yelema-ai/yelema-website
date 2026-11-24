import { BackofficeError } from "@/lib/backoffice";
import { clientIp, rateWindow } from "@/lib/guest-access";
import { apiError } from "@/lib/http";
import { authViaBackoffice } from "@/lib/runtime-config";

// Shared by the /api/auth routes (not a route itself). They exist only when the back office owns
// the sign-in; otherwise the pages talk to Supabase Auth themselves and these answer 404.
export function notEnabled(): Response | null {
  return authViaBackoffice() ? null : apiError("Not found", 404, "not_found");
}

// A back-office refusal, in words for the sign-in screens. The code rides along so the page can tell
// a suspended account from a wrong password.
export function authFailure(e: unknown): Response {
  if (!(e instanceof BackofficeError)) {
    console.error("[auth]", e);
    return apiError("Une erreur est survenue. Réessayez dans un instant.", 500, "internal_error");
  }
  switch (e.code) {
    case "unauthorized":
      return apiError("Adresse ou mot de passe incorrect.", 401, "unauthorized");
    case "suspended":
      return apiError("Votre accès est suspendu. Contactez l’administrateur de votre espace.", 403, "suspended");
    case "rate_limited": {
      const minutes = e.retryAfter ? Math.max(1, Math.ceil(e.retryAfter / 60)) : null;
      const wait = minutes ? `dans ${minutes} minute${minutes > 1 ? "s" : ""}` : "un peu plus tard";
      return apiError(`Trop d’essais. Réessayez ${wait}.`, 429, "rate_limited");
    }
    default:
      return apiError(e.status >= 500 ? "Le service est momentanément indisponible. Réessayez dans un instant." : e.message, e.status, e.code);
  }
}

// In front of the back office's own lock (per account, kept there): per server instance, by account and by address.
// Wide enough for an office behind one address; a script trying passwords stops here without a call.
const WINDOW_MS = 10 * 60_000;
const limits = {
  login: { account: rateWindow(20, WINDOW_MS), ip: rateWindow(60, WINDOW_MS) },
  forgot: { account: rateWindow(5, WINDOW_MS), ip: rateWindow(20, WINDOW_MS) },
};

/** The 429 to answer when this account or this address tried too often; null otherwise. */
export function tooManyTries(kind: keyof typeof limits, request: Request, email: string): Response | null {
  const now = Date.now();
  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "").toLowerCase();
  const ip = clientIp(request.headers, process.env.VERCEL === "1");
  const hit = [limits[kind].account(`${host}\n${email.toLowerCase()}`, now), ...(ip ? [limits[kind].ip(ip, now)] : [])].find((r) => !r.ok);
  if (!hit || hit.ok) return null;
  const minutes = Math.max(1, Math.ceil(hit.retryAfter / 60));
  const res = apiError(`Trop d’essais. Réessayez dans ${minutes} minute${minutes > 1 ? "s" : ""}.`, 429, "rate_limited");
  res.headers.set("Retry-After", String(hit.retryAfter));
  return res;
}
