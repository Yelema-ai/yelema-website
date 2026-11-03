import { instanceFetch } from "@/lib/agent37";
import { requireAgentAccess } from "@/lib/auth";
import { ApiError, handleError } from "@/lib/http";
import { eventStreamOn } from "@/lib/instance-events";
import { upstreamErrorMessage } from "../_helpers";

type Ctx = { params: Promise<{ id: string }> };

// The instance's event stream from the runtime gateway (EVENT_STREAM=on), relayed as is: kinds only, no
// content. Off, or without the gateway, the route does not exist and the tab keeps its polls.
export async function GET(request: Request, { params }: Ctx) {
  try {
    if (!eventStreamOn(process.env)) throw new ApiError(404, "not_found", "Not found");
    const { id } = await params;
    await requireAgentAccess(id);
    const upstream = await instanceFetch(id, "/v1/events", { headers: { Accept: "text/event-stream" }, signal: request.signal });
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

// The host cuts the function at this length; the tab reconnects.
export const maxDuration = 300;
