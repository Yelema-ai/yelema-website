import { NextResponse } from "next/server";
import { ApiError } from "@/lib/http";
import { authViaBackoffice } from "@/lib/runtime-config";
import { readSession } from "@/lib/session";

// Voice calls are the back office's: these routes only relay the browser's signaling with the
// member's session and the request's workspace. It checks the member, the expert and the voice.
export async function voiceToken(): Promise<string> {
  if (!authViaBackoffice()) throw new ApiError(404, "not_found", "Les appels vocaux ne sont pas disponibles.");
  const session = await readSession();
  if (!session) throw new ApiError(401, "unauthorized", "Connectez-vous pour continuer.");
  return session.accessToken;
}

/** The SDK's JSON body, or undefined when it sends none. */
export async function signalingBody(request: Request): Promise<unknown> {
  const text = await request.text();
  if (!text.trim()) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(400, "bad_request", "Cette demande n’a pas pu être traitée.");
  }
}

export function noStore<T>(data: T): NextResponse {
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
