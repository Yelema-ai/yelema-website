import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { siteUrl, supabaseAnonKey, supabaseUrl } from "@/lib/runtime-config";
import { publicSiteOrigin } from "@/lib/site-url";

export async function updateSession(request: NextRequest) {
  // Health checks come from the back-office, carry no session, and must answer even when the
  // Supabase variables are missing — so they skip the auth client entirely.
  if (request.nextUrl.pathname === "/api/health") return NextResponse.next({ request });

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
  const isPublic =
    pathname === "/" ||
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
