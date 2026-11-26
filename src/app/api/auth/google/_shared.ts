import { NextResponse } from "next/server";
import { multiTenant, siteUrl } from "@/lib/runtime-config";
import { googleCookieName, type GoogleReason } from "@/lib/signin-steps";
import { requestSiteOrigin } from "@/lib/site-url";
import { hostOf } from "@/lib/tenant-resolver";

// Shared by the two Google routes (not a route itself).
export const GOOGLE_COOKIE = googleCookieName(process.env.NODE_ENV === "production");

/** This site's public origin: the one the back office sends the browser back to. */
export const siteOrigin = (request: Request): string => requestSiteOrigin(multiTenant(), siteUrl(), hostOf(request.headers), new URL(request.url).origin);

/** Back to /login with the reason in words there (`signin-steps` GOOGLE_ERRORS). */
export function backToLogin(request: Request, reason: GoogleReason): NextResponse {
  const url = new URL("/login", siteOrigin(request));
  url.searchParams.set("error", "google");
  url.searchParams.set("reason", reason);
  return NextResponse.redirect(url, 303);
}
