import { NextResponse, type NextRequest } from "next/server";
import { instanceFetch } from "@/lib/agent37";
import { logSharedOpen, resolveDashboardAccess, sharedRateLimit, TOO_MANY } from "@/lib/dashboard-access";
import { fetchCachedSharedPage } from "@/lib/dashboard-cache";
import { withTimeout } from "@/lib/fetch-timeout";

const MISSING = () => new NextResponse("Fichier introuvable.", { status: 404 });

// The PDF or the page of a shared dashboard, as a download, for the same readers as the dashboard itself.
// Only the expert's fixed `tableau-de-bord.{pdf,html}` (or the state's own path in that folder) is read.
async function firstFound(agentId: string, paths: readonly string[]): Promise<Response | null> {
  for (const path of paths) {
    const res = await instanceFetch(agentId, `/v1/files/content?path=${encodeURIComponent(path)}&disposition=attachment`, withTimeout(undefined, 30_000));
    if (res.ok && res.body) return res;
    await res.body?.cancel().catch(() => undefined);
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const kind = request.nextUrl.searchParams.get("kind");
    const token = request.nextUrl.searchParams.get("s");
    if (kind !== "pdf" && kind !== "html") return MISSING();
    const retryAfter = sharedRateLimit(request, "file", token);
    if (retryAfter !== null) return new NextResponse(TOO_MANY, { status: 429, headers: { "Retry-After": String(retryAfter) } });
    const resolved = await resolveDashboardAccess(token);
    if (!resolved.ok) return new NextResponse(resolved.error, { status: resolved.status });

    let body: BodyInit;
    if (kind === "html") {
      const page = await fetchCachedSharedPage(resolved.agentId, resolved.target.html, resolved.state?.maj);
      if (!page) return MISSING();
      body = page.html;
    } else {
      const upstream = await firstFound(resolved.agentId, resolved.target.pdf);
      if (!upstream?.body) return MISSING();
      body = upstream.body;
    }
    logSharedOpen("file", resolved, `kind=${kind}`);
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": kind === "pdf" ? "application/pdf" : "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="tableau-de-bord.${kind}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (err) {
    console.error("[DashboardFile] Erreur interne:", err);
    return new NextResponse("Le fichier est temporairement indisponible.", { status: 502 });
  }
}
