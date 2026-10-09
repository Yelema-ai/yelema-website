import { ApiError } from "@/lib/http";

// Shared helpers for the per-agent data-plane BFF routes. This is NOT a Next.js route (only
// `route.ts` files are endpoints), just a private module the route handlers in this tree import —
// it keeps the streaming/byte-proxy error handling DRY without growing the app-wide `@/lib/http`.

// Trim a user-supplied string and reject empty input with a 400 — the shape every create/rename/
// move/delete handler that takes a `path`/`from`/`to` needs.
export function requireTrimmed(value: string | null | undefined, message: string): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) throw new ApiError(400, "invalid_request", message);
  return trimmed;
}

// What the member is told when an instance refuses or fails: always `fallback`, a sentence written
// here in French. What the instance answered (English, technical, sometimes an HTML page) goes to
// the server log under `context`, never to the browser. Consumes the Response body — call only on
// the failure path (the success path keeps `upstream.body` intact).
export async function upstreamErrorMessage(upstream: Response, context: string, fallback: string): Promise<string> {
  const text = await upstream.text().catch(() => "");
  console.error(`[${context}] upstream ${upstream.status}`, text.slice(0, 500));
  return fallback;
}

// Throw a mapped ApiError when an Agent37 instance Response failed, reading its body once for the
// message. Returns immediately on success WITHOUT touching the body, so the streaming / upload
// routes can still consume `upstream.body`/`upstream.text()` themselves.
export async function assertUpstreamOk(
  upstream: Response,
  context: string,
  fallback: string,
  code: string
): Promise<void> {
  if (upstream.ok) return;
  throw new ApiError(upstream.status || 502, code, await upstreamErrorMessage(upstream, context, fallback));
}
