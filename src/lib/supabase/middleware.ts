import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { backoffice, BackofficeError } from "@/lib/backoffice";
import { authViaBackoffice, siteUrl, supabaseAnonKey, supabaseUrl } from "@/lib/runtime-config";
import { decodeSession, encodeSession, secondsLeft, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";
import { publicSiteOrigin } from "@/lib/site-url";

export async function updateSession(request: NextRequest) {
  // Health checks come from the back-office, carry no session, and must answer even when the
  // Supabase variables are missing — so they skip the auth client entirely.
  if (request.nextUrl.pathname === "/api/health") return NextResponse.next({ request });
  if (authViaBackoffice()) return updateBackofficeSession(request);

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
    // SITE_URL, not nextUrl: behind the reverse proxy nextUrl can carry the listen address.
    const url = new URL("/login", publicSiteOrigin(siteUrl(), request.nextUrl.origin));
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return response;
}

// Renew the access token this long before it expires, so a request never leaves with a dead one.
const RENEW_BEFORE_S = 120;

function isPublicPath(pathname: string): boolean {
  return (
    pathname.startsWith("/login") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/reset-password") ||
    pathname.startsWith("/invite") ||
    pathname.startsWith("/api/auth")
  );
}

// The same gate when the back office owns the sign-in: the session is one httpOnly cookie holding
// its tokens. It is renewed here, ahead of expiry, by asking the back office, which is also where
// a suspended member or client stops being let in. Whether the session is still GOOD is checked by
// the pages and routes themselves (lib/session); this only makes sure there is one.
async function updateBackofficeSession(request: NextRequest) {
  const { pathname } = request.nextUrl;
  let session = decodeSession(request.cookies.get(SESSION_COOKIE)?.value);
  let renewed: string | null = null;
  let dropped = false;

  if (session && secondsLeft(session) < RENEW_BEFORE_S) {
    try {
      const opened = await backoffice.refresh(session.refreshToken);
      session = opened.session;
      renewed = encodeSession(session);
      // The handlers of THIS request must see the new tokens too.
      request.cookies.set(SESSION_COOKIE, renewed);
    } catch (e) {
      const refused = e instanceof BackofficeError && (e.status === 401 || e.status === 403);
      // Refused: signed out. An outage: keep going on the current token while it still lives.
      if (refused || secondsLeft(session) <= 0) {
        session = null;
        dropped = true;
        request.cookies.delete(SESSION_COOKIE);
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
  if (dropped) response.cookies.delete(SESSION_COOKIE);
  return response;
}
