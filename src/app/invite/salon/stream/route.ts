import { NextResponse } from "next/server";
import { BackofficeError } from "@/lib/backoffice";
import { guestStream, sinceOf } from "@/lib/guest-thread";
import { openRelay } from "@/lib/guest-relay";
import { guestContext, guestFailure, noStore, recheckGuest, salonNames, takeStream, tooManyAcross } from "@/lib/guest-session";
import { apiError } from "@/lib/http";

// `GET /invite/salon/stream` — new messages of the guest's salon as server-sent events, from one relay connection
// this server holds with the guest's key. Closed before the function's limit; the browser resumes (`Last-Event-ID`).
export const maxDuration = 300;
const STREAM_MS = 280_000;

export async function GET(request: Request) {
  const g = await guestContext(request);
  if (g instanceof NextResponse) return g;
  const limited = await tooManyAcross("stream", g.tag);
  if (limited) return limited;
  const release = takeStream(g.tag);
  if (!release) {
    const busy = noStore(apiError("Trop de fenêtres ouvertes sur ce salon.", 429, "rate_limited"));
    busy.headers.set("Retry-After", "30");
    return busy;
  }
  const nowS = Math.floor(Date.now() / 1000);
  const since = sinceOf(request.headers.get("last-event-id") ?? new URL(request.url).searchParams.get("since"), nowS);
  let names: Map<string, string>;
  let relay: Awaited<ReturnType<typeof openRelay>>;
  try {
    names = await salonNames(g.cookie.session, g.ip);
    relay = await openRelay(g.view.relay.url, g.cookie.secret);
  } catch (e) {
    release();
    if (e instanceof BackofficeError) return noStore(guestFailure(e));
    return noStore(apiError("Le salon est momentanément indisponible. Réessayez dans un instant.", 503, "unavailable"));
  }
  const body = guestStream({ relay, channel: g.view.salon.channel, names, since, signal: request.signal, maxMs: STREAM_MS, recheck: () => recheckGuest(g.cookie.session, g.ip), onClose: release });
  return new Response(body, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no" } });
}
