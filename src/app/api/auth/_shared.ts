import { BackofficeError } from "@/lib/backoffice";
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
