import { boundedText } from "@/lib/bounded-body";
import { CLIENT_ERROR_MAX_BYTES, clientErrorLine } from "@/lib/client-error";
import { tokenLimit } from "@/lib/instance-limits";

// 20 a minute per session (its cookie or bearer, hashed), per server instance.
const limit = tokenLimit(20);

// `POST /api/client-error` — a screen's render error, written to the server logs (one line, bounded).
export async function POST(request: Request) {
  const who = request.headers.get("cookie") ?? request.headers.get("authorization") ?? "?";
  if (limit(who) !== null) {
    await request.body?.cancel().catch(() => undefined);
    return new Response(null, { status: 204 });
  }
  const line = clientErrorLine(await boundedText(request, CLIENT_ERROR_MAX_BYTES).catch(() => null));
  if (line) console.error(line);
  return new Response(null, { status: 204 });
}
