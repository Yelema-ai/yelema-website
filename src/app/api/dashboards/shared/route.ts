import { NextResponse, type NextRequest } from "next/server";
import { logSharedOpen, resolveDashboardAccess, sharedRateLimit, TOO_MANY } from "@/lib/dashboard-access";
import { fetchCachedSharedPage } from "@/lib/dashboard-cache";
import { currentPrincipal } from "@/lib/session";

const UNAVAILABLE = "Le tableau de bord n’a pas encore été préparé.";

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get("s");
    const retryAfter = sharedRateLimit(request, "page", token);
    if (retryAfter !== null) {
      return NextResponse.json({ ok: false, error: TOO_MANY, message: TOO_MANY }, { status: 429, headers: { "Retry-After": String(retryAfter) } });
    }
    const resolved = await resolveDashboardAccess(token);

    if (!resolved.ok) {
      // A refused reader sees which account they are signed in with, to switch if it is the wrong one.
      const me = resolved.reason === "forbidden" ? await currentPrincipal().catch(() => null) : null;
      return NextResponse.json(
        {
          ok: false,
          error: resolved.error,
          message: resolved.error,
          reason: resolved.reason,
          currentUserEmail: me?.user.email ?? null,
        },
        { status: resolved.status }
      );
    }

    const { state, meta, mode, target } = resolved;
    // Read now (and kept on this server), so the frame that follows is served without another read.
    const page = target.legacyUrl ? null : await fetchCachedSharedPage(resolved.agentId, target.html, state?.maj);
    if (!target.legacyUrl && !page) return NextResponse.json({ ok: false, error: UNAVAILABLE, message: UNAVAILABLE, reason: "not_found" }, { status: 404 });
    logSharedOpen("page", resolved);

    const s = encodeURIComponent(token ?? "");
    const hasPdf = typeof (state?.pdf ?? state?.pdfPath) === "string";
    return NextResponse.json({
      ok: true,
      mode,
      lien: `/api/dashboards/frame?s=${s}`,
      maj: state?.maj || null,
      title: meta.title,
      description: meta.role || "",
      pdfUrl: hasPdf ? `/api/dashboards/file?s=${s}&kind=pdf` : null,
      htmlUrl: page ? `/api/dashboards/file?s=${s}&kind=html` : null,
    });
  } catch (err) {
    console.error("[DashboardShared] Erreur interne:", err);
    return NextResponse.json(
      { ok: false, error: "Erreur interne lors du chargement du tableau de bord." },
      { status: 500 }
    );
  }
}
