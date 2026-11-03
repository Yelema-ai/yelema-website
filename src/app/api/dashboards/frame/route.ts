import { NextResponse, type NextRequest } from "next/server";
import { requireAgentAccess } from "@/lib/auth";
import { resolveDashboardAccess } from "@/lib/dashboard-access";
import { fetchCachedDashboardState, fetchCachedFrameHtml } from "@/lib/dashboard-cache";
import { getDashboardMeta, isTrustedDashboardUrl } from "@/lib/dashboards";
import { instanceFetch } from "@/lib/agent37";
import { assertInDrive } from "@/lib/drive";
import { expertDriveFolders } from "@/lib/expert-folders";
import { withTimeout } from "@/lib/fetch-timeout";
import { inlineDashboard } from "@/lib/dashboard-inline";

const CSP = [
  "sandbox allow-scripts allow-popups;",
  "default-src 'none';",
  "script-src 'unsafe-inline' 'unsafe-eval';",
  "style-src 'unsafe-inline' https://fonts.googleapis.com;",
  "font-src https://fonts.gstatic.com data:;",
  "img-src data: https: blob:;",
  "connect-src https:;",
  "form-action 'none';",
].join(" ");

// The owner's own preview (agentId + profile, behind their session), or a shared reader's (`s`).
// Without a published link, the owner's preview is the page the expert left in its drive (`path`):
// with no host plugged in, the pack sends its dashboard as an HTML file (Leslie, 29/10).
async function targetOf(request: NextRequest): Promise<{ url: string } | { html: string } | { status: number; error: string }> {
  const token = request.nextUrl.searchParams.get("s");
  if (token) {
    const resolved = await resolveDashboardAccess(token);
    return resolved.ok ? { url: resolved.targetUrl } : { status: resolved.status, error: resolved.error };
  }
  const agentId = request.nextUrl.searchParams.get("agentId") ?? "";
  const profile = request.nextUrl.searchParams.get("profile") ?? "";
  if (!getDashboardMeta(profile) || !/^[a-z0-9_-]+$/i.test(profile)) return { status: 404, error: "Tableau de bord introuvable." };
  try {
    await requireAgentAccess(agentId);
  } catch {
    return { status: 404, error: "Tableau de bord introuvable." };
  }
  const state = await fetchCachedDashboardState(agentId, profile, await expertDriveFolders(profile));
  if (state && isTrustedDashboardUrl(state.lien)) return { url: state.lien };
  const raw = request.nextUrl.searchParams.get("path");
  if (!raw || !raw.toLowerCase().endsWith(".html")) return { status: 404, error: "Tableau de bord introuvable." };
  try {
    const path = assertInDrive(raw);
    const res = await instanceFetch(agentId, `/v1/files/content?path=${encodeURIComponent(path)}`, withTimeout(undefined, 20_000));
    if (!res.ok) return { status: 404, error: "Tableau de bord introuvable." };
    // Its stylesheet, pictures and fonts beside it in the drive go inside the page: the frame's CSP
    // and address would leave them out (unstyled page, broken pictures).
    const read = async (file: string) => {
      const r = await instanceFetch(agentId, `/v1/files/content?path=${encodeURIComponent(assertInDrive(file))}`, withTimeout(undefined, 15_000));
      return r.ok ? new Uint8Array(await r.arrayBuffer()) : null;
    };
    return { html: await inlineDashboard(await res.text(), path, read) };
  } catch {
    return { status: 404, error: "Tableau de bord introuvable." };
  }
}

export async function GET(request: NextRequest) {
  try {
    const target = await targetOf(request);
    if ("status" in target) return new NextResponse(target.error, { status: target.status });
    const html = "html" in target ? target.html : await fetchCachedFrameHtml(target.url);
    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "SAMEORIGIN",
        "Referrer-Policy": "no-referrer",
        "Content-Security-Policy": CSP,
      },
    });
  } catch (err) {
    console.error("[DashboardFrame] Erreur interne:", err);
    return new NextResponse("Le tableau de bord est temporairement indisponible.", { status: 502 });
  }
}
