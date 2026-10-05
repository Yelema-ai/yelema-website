import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  // api/composio-mcp is the instances' tool traffic: no browser session, its own token.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/composio-mcp|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
