import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { backoffice, BackofficeError } from "@/lib/backoffice";
import { authViaBackoffice, deploymentWorkspaceId, multiTenant, siteUrl, supabaseAnonKey, supabaseUrl } from "@/lib/runtime-config";
import { decodeSession, encodeSession, LEGACY_SESSION_COOKIE, secondsLeft, SESSION_COOKIE, sessionCookieOptions, sessionCookieValue } from "@/lib/session";
import { publicSiteOrigin } from "@/lib/site-url";
import { hostOf, resolveHost, TenantError } from "@/lib/tenant-resolver";

export async function updateSession(request: NextRequest) {
  // Health checks come from the back-office, carry no session, and must answer even when the
  // Supabase variables are missing — so they skip the auth client entirely.
  if (request.nextUrl.pathname === "/api/health") return NextResponse.next({ request });

  // One deployment for every client: the host says whose request this is, before anything else.
  let workspace = deploymentWorkspaceId();
  if (multiTenant()) {
    const gate = await tenantGate(request);
    if (gate instanceof NextResponse) return gate;
    workspace = gate;
  }
  if (authViaBackoffice()) return updateBackofficeSession(request, workspace);

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    supabaseUrl()!,
    supabaseAnonKey()!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  // La racine est l'accueil connecté depuis le passage aux routes des maquettes : elle
  // n'est plus publique.
  const isPublic =
    pathname.startsWith("/login") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/reset-password") ||
    pathname.startsWith("/invite");

  if (!user && !isPublic) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: { code: "unauthorized", message: "Sign in required" } }, { status: 401 });
    }
    // SITE_URL, not nextUrl: behind the reverse proxy nextUrl can carry the listen address.
    const url = new URL("/login", publicSiteOrigin(siteUrl(), request.nextUrl.origin));
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return response;
}

// A host the back office does not know, or a suspended client, gets its own page (JSON for the API)
// and nothing else: no sign-in screen, no session renewal. Otherwise, the client's workspace.
async function tenantGate(request: NextRequest): Promise<NextResponse | string> {
  const refuse = (status: number, code: string, message: string, page: string) =>
    request.nextUrl.pathname.startsWith("/api/")
      ? NextResponse.json({ error: { code, message } }, { status })
      : NextResponse.rewrite(new URL(page, request.url), { status });

  const host = hostOf(request.headers);
  let tenant = null;
  try {
    tenant = host ? await resolveHost(host) : null;
  } catch (e) {
    const status = e instanceof TenantError ? e.status : 503;
    return NextResponse.json(
      { error: { code: "unavailable", message: "Le service est momentanément indisponible. Réessayez dans un instant." } },
      { status: status >= 500 ? status : 503 }
    );
  }
  if (!tenant) return refuse(404, "not_found", "Cet espace n’existe pas.", "/espace-introuvable");
  if (tenant.status === "suspended") return refuse(403, "suspended", "Cet espace est suspendu.", "/espace-suspendu");
  return tenant.workspaceId;
}

// Renew the access token this long before it expires, so a request never leaves with a dead one.
const RENEW_BEFORE_S = 120;

function isPublicPath(pathname: string): boolean {
  return (
    pathname.startsWith("/login") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/reset-password") ||
    pathname.startsWith("/invite") ||
    pathname.startsWith("/espace-") ||
    pathname.startsWith("/api/auth")
  );
}

// The same gate when the back office owns the sign-in: the session is one httpOnly cookie holding
// its tokens. It is renewed here, ahead of expiry, by asking the back office, which is also where
// a suspended member or client stops being let in. Whether the session is still GOOD is checked by
// the pages and routes themselves (lib/session); this only makes sure there is one.
async function updateBackofficeSession(request: NextRequest, workspace: string | undefined) {
  const { pathname } = request.nextUrl;
  let session = decodeSession(sessionCookieValue(request.cookies));
  let renewed: string | null = null;
  let dropped = false;

  if (session && secondsLeft(session) < RENEW_BEFORE_S) {
    try {
      const opened = await backoffice.refresh(session.refreshToken, workspace);
      session = opened.session;
      renewed = encodeSession(session);
      // The handlers of THIS request must see the new tokens too.
      request.cookies.set(SESSION_COOKIE, renewed);
      if (SESSION_COOKIE !== LEGACY_SESSION_COOKIE) request.cookies.delete(LEGACY_SESSION_COOKIE);
    } catch (e) {
      const refused = e instanceof BackofficeError && (e.status === 401 || e.status === 403);
      // Refused: signed out. An outage: keep going on the current token while it still lives.
      if (refused || secondsLeft(session) <= 0) {
        session = null;
        dropped = true;
        request.cookies.delete(SESSION_COOKIE);
        request.cookies.delete(LEGACY_SESSION_COOKIE);
      }
    }
  }

  let response: NextResponse;
  if (!session && !isPublicPath(pathname)) {
    if (pathname.startsWith("/api/")) {
      response = NextResponse.json({ error: { code: "unauthorized", message: "Sign in required" } }, { status: 401 });
    } else {
      const url = new URL("/login", publicSiteOrigin(siteUrl(), request.nextUrl.origin));
      url.searchParams.set("next", pathname);
      response = NextResponse.redirect(url);
    }
  } else {
    response = NextResponse.next({ request });
  }

  if (renewed) response.cookies.set(SESSION_COOKIE, renewed, sessionCookieOptions);
  // The cookie's earlier name goes once its value lives under the new one, or is dropped.
  if ((renewed || dropped) && SESSION_COOKIE !== LEGACY_SESSION_COOKIE) response.cookies.delete(LEGACY_SESSION_COOKIE);
  if (dropped) response.cookies.delete(SESSION_COOKIE);
  return response;
}
