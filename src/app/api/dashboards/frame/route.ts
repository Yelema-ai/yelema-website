import { NextResponse, type NextRequest } from "next/server";
import { requireAgentAccess } from "@/lib/auth";
import { resolveDashboardAccess, sharedRateLimit, TOO_MANY } from "@/lib/dashboard-access";
import { fetchCachedDashboardState, fetchCachedFrameHtml, fetchCachedSharedPage } from "@/lib/dashboard-cache";
import { FRAME_CSP, LEGACY_FRAME_CSP } from "@/lib/dashboard-files";
import { getDashboardMeta, legacyLink } from "@/lib/dashboards";
import { instanceFetch } from "@/lib/agent37";
import { assertInDrive } from "@/lib/drive";
import { expertDriveFolders } from "@/lib/expert-folders";
import { withTimeout } from "@/lib/fetch-timeout";
import { inlineDashboard } from "@/lib/dashboard-inline";

type Target = { url: string } | { html: string } | { status: number; error: string; retryAfter?: number };
const MISSING = { status: 404, error: "Tableau de bord introuvable." };

// A shared reader's (`s`): the expert's fixed page on the instance, or its legacy Render page.
async function sharedTarget(request: NextRequest, token: string): Promise<Target> {
  const retryAfter = sharedRateLimit(request, "frame", token);
  if (retryAfter !== null) return { status: 429, error: TOO_MANY, retryAfter };
  const resolved = await resolveDashboardAccess(token);
  if (!resolved.ok) return { status: resolved.status, error: resolved.error };
  if (resolved.target.legacyUrl) return { url: resolved.target.legacyUrl };
  const page = await fetchCachedSharedPage(resolved.agentId, resolved.target.html, resolved.state?.maj);
  return page ? { html: page.html } : MISSING;
}

// The owner's own preview (agentId + profile, behind their session): a legacy Render page while the
// state names no drive page, else the page the expert left in its drive (`path`).
async function ownerTarget(request: NextRequest): Promise<Target> {
  const agentId = request.nextUrl.searchParams.get("agentId") ?? "";
  const profile = request.nextUrl.searchParams.get("profile") ?? "";
  if (!getDashboardMeta(profile) || !/^[a-z0-9_-]+$/i.test(profile)) return MISSING;
  try {
    await requireAgentAccess(agentId);
  } catch {
    return MISSING;
  }
  const legacy = legacyLink(await fetchCachedDashboardState(agentId, profile, await expertDriveFolders(profile)));
  if (legacy) return { url: legacy };
  const raw = request.nextUrl.searchParams.get("path");
  if (!raw || !raw.toLowerCase().endsWith(".html")) return MISSING;
  try {
    const path = assertInDrive(raw);
    const res = await instanceFetch(agentId, `/v1/files/content?path=${encodeURIComponent(path)}`, withTimeout(undefined, 20_000));
    if (!res.ok) return MISSING;
    // Its stylesheet, pictures and fonts beside it in the drive go inside the page: the frame's CSP
    // and address would leave them out (unstyled page, broken pictures).
    const read = async (file: string) => {
      const r = await instanceFetch(agentId, `/v1/files/content?path=${encodeURIComponent(assertInDrive(file))}`, withTimeout(undefined, 15_000));
      return r.ok ? new Uint8Array(await r.arrayBuffer()) : null;
    };
    return { html: await inlineDashboard(await res.text(), path, read) };
  } catch {
    return MISSING;
  }
}

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get("s");
    const target = token ? await sharedTarget(request, token) : await ownerTarget(request);
    if ("status" in target) {
      const headers = target.retryAfter ? { "Retry-After": String(target.retryAfter) } : undefined;
      return new NextResponse(target.error, { status: target.status, headers });
    }
    const html = "html" in target ? target.html : await fetchCachedFrameHtml(target.url);
    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "SAMEORIGIN",
        "Referrer-Policy": "no-referrer",
        "Content-Security-Policy": "html" in target ? FRAME_CSP : LEGACY_FRAME_CSP,
      },
    });
  } catch (err) {
    console.error("[DashboardFrame] Erreur interne:", err);
    return new NextResponse("Le tableau de bord est temporairement indisponible.", { status: 502 });
  }
}
