import { instanceFetch } from "@/lib/agent37";
import { requireAgentAccess } from "@/lib/auth";
import { ApiError, handleError } from "@/lib/http";
import { eventStreamOn, resumeId } from "@/lib/instance-events";
import { upstreamErrorMessage } from "../_helpers";

type Ctx = { params: Promise<{ id: string }> };

// The instance's event stream from the runtime gateway (EVENT_STREAM=on), relayed as is: kinds only, no
// content. Off, or without the gateway, the route does not exist and the tab keeps its polls.
export async function GET(request: Request, { params }: Ctx) {
  try {
    if (!eventStreamOn(process.env)) throw new ApiError(404, "not_found", "Not found");
    const { id } = await params;
    await requireAgentAccess(id);
    // A reconnect resumes where it stopped: the browser's own header, or ours (a new EventSource has none).
    const last = resumeId(request.headers.get("last-event-id") ?? new URL(request.url).searchParams.get("lastEventId"));
    const headers: Record<string, string> = { Accept: "text/event-stream", ...(last ? { "Last-Event-ID": last } : {}) };
    const upstream = await instanceFetch(id, "/v1/events", { headers, signal: request.signal });
    if (!upstream.ok || !upstream.body) {
      const message = await upstreamErrorMessage(upstream, "agents/events", "Le fil d’événements n’est pas disponible.");
      throw new ApiError(upstream.status || 502, "upstream_error", message);
    }
    return new Response(upstream.body, {
      status: 200,
      headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no", Connection: "keep-alive" },
    });
  } catch (e) {
    return handleError(e);
  }
}

// The host cuts the function at this length; the tab reconnects with Last-Event-ID.
export const maxDuration = 300;
