import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  // api/composio-mcp, api/memory-mcp, api/yele-mcp, api/stt and api/webhooks/meetstream are not browser traffic: no session, their own token or signature.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/composio-mcp|api/memory-mcp|api/yele-mcp|api/stt|api/webhooks/meetstream|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4)$).*)",
  ],
};
