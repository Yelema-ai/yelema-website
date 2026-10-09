import { ApiError } from "@/lib/http";
import { authViaBackoffice } from "@/lib/runtime-config";
import { currentPrincipal, readSession } from "@/lib/session";

// Billing is the back office's, and its admins' only. Answers the session token to call it with.
// The back office checks the role again on every call; this check saves a member the round-trip
// and keeps the routes closed when the app does not sign in through the back office at all.
export async function billingToken(): Promise<string> {
  if (!authViaBackoffice()) throw new ApiError(404, "not_found", "La facturation n’est pas disponible.");
  const [session, me] = await Promise.all([readSession(), currentPrincipal()]);
  if (!session || !me) throw new ApiError(401, "unauthorized", "Connectez-vous pour continuer.");
  if (me.user.role !== "admin") throw new ApiError(403, "forbidden", "Cette page est réservée aux administrateurs.");
  return session.accessToken;
}
