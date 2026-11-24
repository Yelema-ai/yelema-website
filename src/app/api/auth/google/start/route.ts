import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { authViaBackoffice, backofficeUrl } from "@/lib/runtime-config";
import { googleCookieOptions, googleStartUrl } from "@/lib/signin-steps";
import { pinnedWorkspaceId } from "@/lib/tenant";
import { backToLogin, GOOGLE_COOKIE, siteOrigin } from "../_shared";

// « Continuer avec Google » : off to the back office, which holds the PKCE state and comes back to
// /api/auth/google/callback. The cookie set here is what lets that return in (no sign-in pushed by another site).
export async function GET(request: Request) {
  const base = backofficeUrl();
  if (!authViaBackoffice() || !base) return backToLogin(request, "unavailable");
  let workspace: string | undefined;
  try {
    workspace = await pinnedWorkspaceId();
  } catch {
    return backToLogin(request, "unavailable");
  }
  const res = NextResponse.redirect(googleStartUrl(base, siteOrigin(request), workspace), 303);
  res.cookies.set(GOOGLE_COOKIE, randomBytes(16).toString("base64url"), googleCookieOptions(process.env.NODE_ENV === "production"));
  return res;
}
