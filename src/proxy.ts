import { NextResponse, type NextRequest } from "next/server";
import { buildCsp, cspApplies, cspHeaderName, cspMode } from "@/lib/csp";
import { allowedOrigins, crossSiteWrite, csrfMode } from "@/lib/csrf";
import { backofficeUrl, brandLogoUrl, supabaseUrl } from "@/lib/runtime-config";
import { updateSession } from "@/lib/supabase/middleware";
import { hostOf } from "@/lib/tenant-resolver";

export async function proxy(request: NextRequest) {
  const refused = refuseCrossSite(request);
  if (refused) return refused;
  return withCsp(request, await updateSession(request));
}

// Before anything else, and from headers alone: a write sent by another site's page goes no further.
function refuseCrossSite(request: NextRequest): NextResponse | null {
  const mode = csrfMode(process.env.CSRF_MODE);
  if (mode === "off" || !crossSiteWrite(request.method, request.headers, hostOf(request.headers), allowedOrigins(process.env.CSRF_ALLOWED_ORIGINS))) return null;
  console.warn(`[csrf] ${request.method} ${request.nextUrl.pathname} site=${request.headers.get("sec-fetch-site") ?? "-"} mode=${mode}`);
  return mode === "enforce" ? NextResponse.json({ error: { code: "cross_site", message: "Cette demande ne vient pas de l’application." } }, { status: 403 }) : null;
}

let csp: { key: string; value: string } | null = null;

function withCsp(request: NextRequest, response: NextResponse): NextResponse {
  const mode = cspMode(process.env.CSP_MODE);
  if (mode === "off" || !cspApplies(request.nextUrl.pathname)) return response;
  const env = process.env;
  const key = [backofficeUrl(), brandLogoUrl(), supabaseUrl(), env.CSP_IMG_SRC, env.CSP_CONNECT_SRC, env.CSP_FRAME_SRC].join("\n");
  if (csp?.key !== key) {
    csp = { key, value: buildCsp({ dev: env.NODE_ENV !== "production", own: [backofficeUrl(), brandLogoUrl(), supabaseUrl()], img: env.CSP_IMG_SRC, connect: env.CSP_CONNECT_SRC, frame: env.CSP_FRAME_SRC }) };
  }
  response.headers.set(cspHeaderName(mode), csp.value);
  return response;
}

export const config = {
  // Kept equal to PROXY_MATCHER (lib/proxy-matcher.ts, tested): Next reads this value from the source, it cannot be imported.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/composio-mcp|api/memory-mcp|api/yele-mcp|api/stt|api/webhooks/meetstream|api/meetings/icons/|(?!api/).*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4)$).*)",
  ],
};
